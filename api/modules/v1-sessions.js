'use strict';

const crypto = require('crypto');
const { getPool, withTransaction } = require('../db');

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
                  total_duration_seconds=$6,total_paused_seconds=$7,total_minutes=$6::numeric/60
            where organization_id=$1 and id=$2 returning *`,
          [row.organization_id, row.id, nextStatus, lifecycle, endedAt,
           timing.total_duration_seconds, timing.total_paused_seconds]
        );
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
      const total = await pool.query(`select count(*)::int as count from app.work_sessions ws where ${filters.join(' and ')}`, values.slice(0, values.length - 2));
      res.json({ data: rows.rows, pagination: { limit, offset, total: total.rows[0].count } });
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

module.exports = { createSessionsRouter, createTrackingSessionsRouter, deriveTiming };