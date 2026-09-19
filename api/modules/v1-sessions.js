'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { getPool, withTransaction } = require('../db');

const DATA_ROOT = path.resolve(process.env.DATA_ROOT || (process.platform === 'win32'
  ? path.join(process.cwd(), 'data')
  : '/opt/teler/data'));

function safeUploadId(value) {
  const normalized = String(value || '').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(normalized) ? normalized : crypto.randomUUID();
}

function decodeMetadataHeader(value, maxLength = 500) {
  if (!value) return '';
  try {
    const encoded = String(value).trim();
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) return '';
    return Buffer.from(encoded, 'base64url').toString('utf8').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, maxLength);
  } catch {
    return '';
  }
}

function decodeVisualHashHeader(value) {
  const raw = String(value || '').trim();
  if (/^[a-f0-9]{16,64}$/i.test(raw)) return raw.toLowerCase();
  const decoded = decodeMetadataHeader(raw, 64);
  return /^[a-f0-9]{16,64}$/i.test(decoded) ? decoded.toLowerCase() : '';
}

function sanitizeBrowserTabs(value) {
  const decoded = decodeMetadataHeader(value, 6000);
  try {
    const tabs = JSON.parse(decoded);
    if (!Array.isArray(tabs)) return [];
    return tabs.slice(0, 12).flatMap(tab => {
      if (!tab || typeof tab !== 'object') return [];
      try {
        const url = new URL(String(tab.url || ''));
        if (!['http:', 'https:'].includes(url.protocol)) return [];
        url.search = ''; url.hash = ''; url.username = ''; url.password = '';
        return [{ title: String(tab.title || url.hostname).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120), url: url.toString().slice(0, 260) }];
      } catch { return []; }
    });
  } catch { return []; }
}

function canonicalCaptureTime(value, receivedAt = new Date()) {
  const clientTime = new Date(String(value || ''));
  // Desktop versions before timezone-aware timestamps send local wall-clock
  // text. Treat a clock that differs materially from server receipt as unsafe
  // so a UTC offset cannot push evidence into a later AI window.
  if (Number.isNaN(clientTime.getTime()) || Math.abs(clientTime.getTime() - receivedAt.getTime()) > 10 * 60_000) {
    return receivedAt;
  }
  return clientTime;
}

const AI_BATCH_MINUTES = 15;

async function queueEvidenceBatch(client, context, windowEnd, final = false) {
  const runAfter = new Date(windowEnd);
  const suffix = final ? 'final' : runAfter.toISOString();
  await client.query(`insert into app.background_jobs (job_type,priority,payload,dedupe_key,run_after)
    values ('EvidenceAiAnalysis',2,$1,$2,$3)
    on conflict (dedupe_key) do nothing`, [
    { ...context, window_end: runAfter.toISOString(), final },
    `evidence-ai:${context.session_id}:${suffix}`,
    runAfter,
  ]);
}

function canManageOrganizationEvidence(authUser) {
  return ['owner', 'admin'].includes(String(authUser?.organization?.role || '').toLowerCase());
}

function screenshotReadQuery(screenshotId, authUser) {
  if (authUser && canManageOrganizationEvidence(authUser)) {
    return {
      text: 'select storage_path from app.screenshots where id=$1 and organization_id=$2 limit 1',
      values: [screenshotId, authUser.organization.id],
    };
  }
  if (authUser) {
    return {
      text: `select ss.storage_path
               from app.screenshots ss
               join app.work_sessions ws
                 on ws.organization_id=ss.organization_id and ws.id=ss.session_id
              where ss.id=$1 and ws.user_profile_id=$2 and ss.organization_id=$3 limit 1`,
      values: [screenshotId, authUser.id, authUser.organization.id],
    };
  }
  return { text: 'select storage_path from app.screenshots where id=$1 limit 1', values: [screenshotId] };
}

function secondsBetween(a, b) {
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000));
}

function deriveTiming(events, now = new Date()) {
  const ordered = [...events].sort((a, b) => {
    const byTime = new Date(a.event_ts).getTime() - new Date(b.event_ts).getTime();
    return byTime || String(a.id || '').localeCompare(String(b.id || ''));
  });
  let runningFrom = null;
  let pausedFrom = null;
  let totalDurationSeconds = 0;
  let totalPausedSeconds = 0;
  let status = 'stopped';
  let startedAt = null;
  let endedAt = null;

  for (const event of ordered) {
    const ts = new Date(event.event_ts);
    if (event.event_type === 'start') {
      startedAt ||= ts;
      runningFrom = ts;
      pausedFrom = null;
      status = 'running';
    } else if (event.event_type === 'pause' && runningFrom) {
      totalDurationSeconds += secondsBetween(runningFrom, ts);
      runningFrom = null;
      pausedFrom = ts;
      status = 'paused';
    } else if (event.event_type === 'resume' && pausedFrom) {
      totalPausedSeconds += secondsBetween(pausedFrom, ts);
      pausedFrom = null;
      runningFrom = ts;
      status = 'running';
    } else if (event.event_type === 'stop') {
      if (runningFrom) totalDurationSeconds += secondsBetween(runningFrom, ts);
      if (pausedFrom) totalPausedSeconds += secondsBetween(pausedFrom, ts);
      runningFrom = null;
      pausedFrom = null;
      status = 'stopped';
      endedAt = ts;
    }
  }

  if (status === 'running' && runningFrom) totalDurationSeconds += secondsBetween(runningFrom, now);
  if (status === 'paused' && pausedFrom) totalPausedSeconds += secondsBetween(pausedFrom, now);

  return {
    status,
    started_at: startedAt ? startedAt.toISOString() : null,
    ended_at: endedAt ? endedAt.toISOString() : null,
    total_duration_seconds: totalDurationSeconds,
    total_paused_seconds: totalPausedSeconds,
    pause_count: ordered.filter(event => event.event_type === 'pause').length,
  };
}

async function sessionEvents(client, organizationId, sessionId) {
  const result = await client.query(
    `select id,event_type,event_ts,client_event_id,client_source
       from app.session_events
      where organization_id=$1 and session_id=$2
      order by event_ts,id`,
    [organizationId, sessionId]
  );
  return result.rows;
}

function serializeTrackingSession(row, timing, events) {
  return {
    id: row.id,
    role_at_time: row.role_at_time || row.job_role || 'general',
    start_ts: timing.started_at || row.started_at,
    end_ts: timing.ended_at || row.ended_at || null,
    status: timing.status || row.tracking_status || 'stopped',
    total_duration_seconds: timing.total_duration_seconds ?? Number(row.total_duration_seconds || 0),
    total_paused_seconds: timing.total_paused_seconds ?? Number(row.total_paused_seconds || 0),
    pause_count: timing.pause_count ?? 0,
    events: events || undefined,
  };
}

function createTrackingSessionsRouter(express) {
  const router = express.Router();

  // A capture is a raw PNG so it never enters the JSON parser. The client event
  // id becomes the filename, making network retries idempotent.
  router.post('/:id/screenshots', express.raw({ type: ['image/png', 'image/jpeg'], limit: '20mb' }), async (req, res) => {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (!['image/png', 'image/jpeg'].includes(contentType) || !Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'A PNG or JPEG screenshot is required' });
    }
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });

      const eventId = safeUploadId(req.headers['x-client-event-id']);
      const extension = contentType === 'image/jpeg' ? 'jpg' : 'png';
      const visualHash = decodeVisualHashHeader(req.headers['x-visual-hash'] || req.query.visual_hash);
      const browserTabs = sanitizeBrowserTabs(req.headers['x-browser-tabs'] || req.query.browser_tabs);
    try {
      const session = await pool.query(
        `select id,organization_id from app.work_sessions where id=$1 and user_profile_id=$2 limit 1`,
        [req.params.id, req.authUser.id]
      );
      if (!session.rowCount) return res.status(404).json({ error: 'Session not found' });

      const row = session.rows[0];
      const storagePath = path.posix.join('screenshots', row.organization_id, row.id, `${eventId}.${extension}`);
      const destination = path.resolve(DATA_ROOT, storagePath);
      if (!destination.startsWith(`${DATA_ROOT}${path.sep}`)) return res.status(400).json({ error: 'Invalid screenshot destination' });

      await fs.mkdir(path.dirname(destination), { recursive: true });
      try {
        await fs.access(destination);
      } catch {
        const temporary = `${destination}.${crypto.randomUUID()}.uploading`;
        await fs.writeFile(temporary, req.body, { mode: 0o600 });
        await fs.rename(temporary, destination);
      }

      const capturedAt = canonicalCaptureTime(req.headers['x-captured-at']);
      const metadata = await pool.query(
        `insert into app.screenshots
          (organization_id,session_id,storage_path,active_window,active_app,visual_hash,browser_tabs,captured_at)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
         on conflict (organization_id,storage_path) do update set storage_path=excluded.storage_path
         returning id,storage_path,captured_at`,
         [row.organization_id, row.id, storagePath,
         decodeMetadataHeader(req.headers['x-active-window']),
         decodeMetadataHeader(req.headers['x-active-app']),
         visualHash || null, JSON.stringify(browserTabs),
         Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt]
      );
      return res.status(201).json({ data: metadata.rows[0] });
    } catch (error) {
      console.error('[tracking/screenshot-upload]', error.message);
      return res.status(500).json({ error: 'Unable to save screenshot' });
    }
  });

  // The desktop collects aggregate input counts and active-window samples
  // locally. It submits them after a session ends; the worker then derives
  // metrics and alerts without receiving raw keystrokes.
  router.post('/:id/telemetry', async (req, res) => {
    const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 12_000) : [];
    const summary = req.body?.summary && typeof req.body.summary === 'object' ? req.body.summary : {};
    if (!events.length) return res.status(400).json({ error: 'At least one telemetry event is required' });
    const safeEvents = events.map(event => ({
      timestamp: String(event?.timestamp || '').slice(0, 64),
      window_title: String(event?.window_title || event?.active_window || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 500),
      active_url: String(event?.active_url || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 2000),
      keys: Math.max(0, Math.min(10_000_000, Number(event?.keys) || 0)),
      clicks: Math.max(0, Math.min(10_000_000, Number(event?.clicks) || 0)),
      idle_seconds: Math.max(0, Math.min(86_400, Number(event?.idle_seconds) || 0)),
    })).filter(event => !Number.isNaN(new Date(event.timestamp).getTime()));
    if (!safeEvents.length) return res.status(400).json({ error: 'No valid telemetry timestamps were supplied' });
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const session = await pool.query(`select id,organization_id,employee_id,tracking_status
        from app.work_sessions where id=$1 and user_profile_id=$2 limit 1`, [req.params.id, req.authUser.id]);
      if (!session.rowCount) return res.status(404).json({ error: 'Session not found' });
      const row = session.rows[0];
      if (row.tracking_status !== 'stopped') return res.status(409).json({ error: 'Stop tracking before submitting telemetry' });
      const storagePath = path.posix.join('telemetry', row.organization_id, `${row.id}.json`);
      const destination = path.resolve(DATA_ROOT, storagePath);
      if (!destination.startsWith(`${DATA_ROOT}${path.sep}`)) return res.status(400).json({ error: 'Invalid telemetry destination' });
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, JSON.stringify({ events: safeEvents, summary: {
        key_count: Math.max(0, Number(summary.key_count) || 0), mouse_clicks: Math.max(0, Number(summary.mouse_clicks) || 0),
      } }), { mode: 0o600 });
      await pool.query(`insert into app.background_jobs (job_type,priority,payload,dedupe_key,run_after)
        values ('SessionNormalization',3,$1,$2,now())
        on conflict (dedupe_key) do update set payload=excluded.payload,status='pending',run_after=now(),error_message=null,completed_at=null`,
      [{ organization_id: row.organization_id, employee_id: row.employee_id, session_id: row.id, raw_path: destination }, `normalize:${row.id}`]);
      return res.status(202).json({ data: { session_id: row.id, status: 'queued', telemetry_events: safeEvents.length } });
    } catch (error) {
      console.error('[tracking/telemetry]', error.message);
      return res.status(500).json({ error: 'Unable to queue telemetry analysis' });
    }
  });

  router.get('/current', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const result = await pool.query(
        `select ws.*,e.job_role from app.work_sessions ws
          join app.employees e on e.organization_id=ws.organization_id and e.id=ws.employee_id
         where ws.user_profile_id=$1 and ws.tracking_status in ('running','paused')
         order by ws.started_at desc limit 1`,
        [req.authUser.id]
      );
      if (!result.rowCount) return res.json({ data: null });
      const row = result.rows[0];
      const events = await sessionEvents(pool, row.organization_id, row.id);
      const timing = deriveTiming(events);
      return res.json({ data: serializeTrackingSession(row, timing, events), server_ts: new Date().toISOString() });
    } catch (error) {
      console.error('[tracking/current]', error.message);
      return res.status(500).json({ error: 'Unable to load current session' });
    }
  });

  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    try {
      const rows = await pool.query(
        `select ws.*,e.job_role
           from app.work_sessions ws
           join app.employees e on e.organization_id=ws.organization_id and e.id=ws.employee_id
          where ws.employee_id=$1 and ws.tracking_status is not null
          order by ws.started_at desc limit $2 offset $3`,
        [req.authUser.employeeId, limit, offset]
      );
      const data = [];
      for (const row of rows.rows) {
        const events = await sessionEvents(pool, row.organization_id, row.id);
        data.push(serializeTrackingSession(row, deriveTiming(events)));
      }
      const total = await pool.query(
        `select count(*)::int as count from app.work_sessions where employee_id=$1 and tracking_status is not null`,
        [req.authUser.employeeId]
      );
      return res.json({ data, pagination: { limit, offset, total: total.rows[0].count } });
    } catch (error) {
      console.error('[tracking/list]', error.message);
      return res.status(500).json({ error: 'Unable to load tracking sessions' });
    }
  });

  router.post('/start', async (req, res) => {
    const source = String(req.body?.client_source || 'unknown').slice(0, 40);
    const clientEventId = req.body?.client_event_id ? String(req.body.client_event_id).slice(0, 160) : null;
    const role = String(req.body?.role_at_time || req.authUser.jobRole || 'general').trim().slice(0, 120) || 'general';
    try {
      const data = await withTransaction(async client => {
        const active = await client.query(
          `select id from app.work_sessions
            where user_profile_id=$1 and tracking_status in ('running','paused')
            order by started_at desc limit 1 for update`,
          [req.authUser.id]
        );
        if (active.rowCount) {
          const error = new Error('A tracking session is already active');
          error.status = 409;
          throw error;
        }
        const eventTs = new Date();
        const sessionId = crypto.randomUUID();
        const externalId = `control:${sessionId}`;
        const inserted = await client.query(
          `insert into app.work_sessions
            (id,organization_id,employee_id,user_profile_id,external_session_id,status,tracking_status,
             started_at,total_minutes,total_duration_seconds,total_paused_seconds,role_at_time,storage_prefix,source_version)
           values ($1,$2,$3,$4,$5,'open','running',$6,0,0,0,$7,$8,'tracking-control-v1')
           returning *`,
          [sessionId, req.authUser.organization.id, req.authUser.employeeId, req.authUser.id, externalId,
           eventTs, role, `control-api/${sessionId}`]
        );
        await client.query(
          `insert into app.session_events
            (organization_id,session_id,user_profile_id,event_type,event_ts,client_event_id,client_source)
           values ($1,$2,$3,'start',$4,$5,$6)`,
          [req.authUser.organization.id, sessionId, req.authUser.id, eventTs, clientEventId, source]
        );
        // Evidence is analysed in bounded 15-minute windows, never on every
        // upload. This keeps AI cost predictable and gives managers timely data.
        await queueEvidenceBatch(client, {
          organization_id: req.authUser.organization.id,
          employee_id: req.authUser.employeeId,
          session_id: sessionId,
        }, new Date(eventTs.getTime() + AI_BATCH_MINUTES * 60_000));
        const events = await sessionEvents(client, req.authUser.organization.id, sessionId);
        return serializeTrackingSession(inserted.rows[0], deriveTiming(events, eventTs), events);
      });
      return res.status(201).json({ data, server_ts: new Date().toISOString() });
    } catch (error) {
      console.error('[tracking/start]', error.message);
      return res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to start tracking session' });
    }
  });

  async function transition(req, res, eventType, expectedStatus, nextStatus) {
    const source = String(req.body?.client_source || 'unknown').slice(0, 40);
    const clientEventId = req.body?.client_event_id ? String(req.body.client_event_id).slice(0, 160) : null;
    try {
      const data = await withTransaction(async client => {
        const result = await client.query(
          `select ws.*,e.job_role from app.work_sessions ws
            join app.employees e on e.organization_id=ws.organization_id and e.id=ws.employee_id
           where ws.id=$1 and ws.user_profile_id=$2 for update`,
          [req.params.id, req.authUser.id]
        );
        if (!result.rowCount) {
          const error = new Error('Session not found');
          error.status = 404;
          throw error;
        }
        const row = result.rows[0];
        if (clientEventId) {
          const duplicate = await client.query(
            `select 1 from app.session_events where session_id=$1 and client_event_id=$2 limit 1`,
            [row.id, clientEventId]
          );
          if (duplicate.rowCount) {
            const events = await sessionEvents(client, row.organization_id, row.id);
            return serializeTrackingSession(row, deriveTiming(events), events);
          }
        }
        const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
        if (!expectedStatuses.includes(row.tracking_status)) {
          const error = new Error(`Session is ${row.tracking_status || 'not active'}; expected ${expectedStatuses.join(' or ')}`);
          error.status = 409;
          throw error;
        }
        const eventTs = new Date();
        await client.query(
          `insert into app.session_events
            (organization_id,session_id,user_profile_id,event_type,event_ts,client_event_id,client_source)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [row.organization_id, row.id, req.authUser.id, eventType, eventTs, clientEventId, source]
        );
        const events = await sessionEvents(client, row.organization_id, row.id);
        const timing = deriveTiming(events, eventTs);
        const lifecycle = nextStatus === 'stopped' ? 'complete' : row.status;
        const endedAt = nextStatus === 'stopped' ? eventTs : null;
        const updated = await client.query(
          `update app.work_sessions
              set tracking_status=$3,status=$4,ended_at=coalesce($5,ended_at),
                  total_duration_seconds=$6::bigint,total_paused_seconds=$7::bigint,
                  total_minutes=($6::bigint::numeric/60),updated_at=now()
            where organization_id=$1 and id=$2 returning *`,
          [row.organization_id, row.id, nextStatus, lifecycle, endedAt,
           timing.total_duration_seconds, timing.total_paused_seconds]
        );
        if (nextStatus === 'stopped') {
          // A short session still waits for its first 15-minute batch. Longer
          // sessions immediately flush only evidence not handled by earlier jobs.
          const firstBatch = new Date(new Date(row.started_at).getTime() + AI_BATCH_MINUTES * 60_000);
          if (eventTs >= firstBatch) {
            await queueEvidenceBatch(client, {
              organization_id: row.organization_id,
              employee_id: row.employee_id,
              session_id: row.id,
            }, eventTs, true);
          }
        }
        return serializeTrackingSession(updated.rows[0], timing, events);
      });
      return res.json({ data, server_ts: new Date().toISOString() });
    } catch (error) {
      console.error(`[tracking/${eventType}]`, error.message);
      return res.status(error.status || 500).json({ error: error.status ? error.message : `Unable to ${eventType} tracking session` });
    }
  }

  router.post('/:id/pause', (req, res) => transition(req, res, 'pause', 'running', 'paused'));
  router.post('/:id/resume', (req, res) => transition(req, res, 'resume', 'paused', 'running'));
  router.post('/:id/stop', (req, res) => transition(req, res, 'stop', ['running', 'paused'], 'stopped'));

  return router;
}

function createSessionsRouter(express) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const values = [organizationId];
    const filters = ['ws.organization_id=$1'];
    if (req.query.employee_id) { values.push(req.query.employee_id); filters.push(`ws.employee_id=$${values.length}`); }
    if (req.query.start) { values.push(req.query.start); filters.push(`ws.started_at >= $${values.length}::timestamptz`); }
    if (req.query.end) { values.push(req.query.end); filters.push(`ws.started_at <= $${values.length}::timestamptz`); }
    values.push(limit, offset);
    try {
      const rows = await pool.query(`select ws.id,ws.external_session_id,ws.employee_id,e.display_name as employee_name,
        ws.started_at,ws.ended_at,ws.total_minutes,ws.status,ws.role_at_time,ws.tracking_status,
        ws.total_duration_seconds,ws.total_paused_seconds,
        sm.productivity_score,sm.active_minutes,sm.idle_minutes,sm.deep_work_minutes,sm.app_switch_count,sm.key_count,sm.mouse_clicks
        from app.work_sessions ws join app.employees e on e.organization_id=ws.organization_id and e.id=ws.employee_id
        left join app.session_metrics sm on sm.organization_id=ws.organization_id and sm.session_id=ws.id
        where ${filters.join(' and ')} order by ws.started_at desc limit $${values.length-1} offset $${values.length}`, values);
      const sessionIds = rows.rows.map(row => row.id);
      const screenshots = sessionIds.length ? await pool.query(
        `select id,session_id,captured_at,browser_tabs from app.screenshots
          where organization_id=$1 and session_id = any($2::uuid[])
          order by captured_at asc`,
        [organizationId, sessionIds]
      ) : { rows: [] };
      const screenshotsBySession = new Map();
      for (const screenshot of screenshots.rows) {
        const existing = screenshotsBySession.get(screenshot.session_id) || [];
        existing.push(screenshot);
        screenshotsBySession.set(screenshot.session_id, existing);
      }
      const data = rows.rows.map(row => ({ ...row, screenshots: screenshotsBySession.get(row.id) || [] }));
      const total = await pool.query(`select count(*)::int as count from app.work_sessions ws where ${filters.join(' and ')}`, values.slice(0, values.length - 2));
      res.json({ data, pagination: { limit, offset, total: total.rows[0].count } });
    } catch (error) { console.error('[v1/sessions]', error.message); res.status(500).json({ error: 'Unable to load sessions' }); }
  });
  router.get('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const row = await pool.query(`select ws.*,e.display_name as employee_name,sm.* from app.work_sessions ws
        join app.employees e on e.organization_id=ws.organization_id and e.id=ws.employee_id
        left join app.session_metrics sm on sm.organization_id=ws.organization_id and sm.session_id=ws.id
        where ws.organization_id=$1 and ws.id=$2`, [organizationId, req.params.id]);
      if (!row.rowCount) return res.status(404).json({ error: 'Session not found' });
      const apps = await pool.query('select app_name,category,started_at,ended_at,duration_seconds,key_count,click_count from app.app_usage where organization_id=$1 and session_id=$2 order by started_at', [organizationId, req.params.id]);
      const blocks = await pool.query('select block_type,app_name,started_at,ended_at,duration_seconds from app.focus_blocks where organization_id=$1 and session_id=$2 order by started_at', [organizationId, req.params.id]);
      res.json({ data: { ...row.rows[0], app_usage: apps.rows, focus_blocks: blocks.rows } });
    } catch (error) { console.error('[v1/session]', error.message); res.status(500).json({ error: 'Unable to load session' }); }
  });
  return router;
}

function createScreenshotsRouter(express) {
  const router = express.Router();
  router.get('/:id/content', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const query = screenshotReadQuery(req.params.id, req.authUser);
      const result = await pool.query(query.text, query.values);
      if (!result.rowCount) return res.status(404).json({ error: 'Screenshot not found' });
      const storagePath = String(result.rows[0].storage_path || '');
      const filePath = path.resolve(DATA_ROOT, storagePath);
      if (!filePath.startsWith(`${DATA_ROOT}${path.sep}`)) return res.status(400).json({ error: 'Invalid screenshot path' });
      await fs.access(filePath);
      res.set('Cache-Control', 'private, no-store');
      res.type(path.extname(filePath) === '.jpg' ? 'image/jpeg' : 'image/png');
      return res.sendFile(filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') return res.status(404).json({ error: 'Screenshot file not found' });
      console.error('[screenshots/content]', error.message);
      return res.status(500).json({ error: 'Unable to load screenshot' });
    }
  });
  return router;
}

module.exports = {
  createSessionsRouter,
  createTrackingSessionsRouter,
  createScreenshotsRouter,
  deriveTiming,
  safeUploadId,
  decodeMetadataHeader,
  decodeVisualHashHeader,
  sanitizeBrowserTabs,
  canonicalCaptureTime,
  canManageOrganizationEvidence,
  screenshotReadQuery,
};
