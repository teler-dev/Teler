'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { withTransaction } = require('../db');

const BASE = process.env.DATA_ROOT || (process.platform === 'win32' ? path.join(process.cwd(), 'data') : '/opt/teler/data');
const MAX_EVENTS = 100_000;
const safeKey = value => String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
const validDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };

function validate(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ['JSON object body is required'];
  if (!body.organization_external_key && !body.organization_slug && !body.organization_id) errors.push('organization identity is required');
  if (!body.employee_external_key && !body.employee_id) errors.push('employee identity is required');
  if (!body.external_session_id || String(body.external_session_id).length > 180) errors.push('external_session_id is required and must be <= 180 chars');
  if (!validDate(body.started_at)) errors.push('started_at must be a valid timestamp');
  if (body.ended_at && !validDate(body.ended_at)) errors.push('ended_at must be a valid timestamp');
  if (body.events && !Array.isArray(body.events)) errors.push('events must be an array');
  if (Array.isArray(body.events) && body.events.length > MAX_EVENTS) errors.push(`events exceeds ${MAX_EVENTS}`);
  return errors;
}

function atomicArchive(body) {
  const org = safeKey(body.organization_external_key || body.organization_slug || body.organization_id || 'unknown');
  const session = safeKey(body.external_session_id);
  const dir = path.join(BASE, 'structured-ingest', org);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${session}.json`);
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, dest);
  return dest;
}

function createIngestionRouter(express) {
  const router = express.Router();
  router.post('/session', async (req, res) => {
    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ error: 'Invalid session payload', details: errors });
    const rawPath = atomicArchive(req.body);
    try {
      const result = await withTransaction(async client => {
        const body = req.body;
        let organization;
        if (body.organization_id) {
          organization = (await client.query('select id from app.organizations where id=$1 and status=$2', [body.organization_id, 'active'])).rows[0];
        } else if (body.organization_external_key) {
          organization = (await client.query('select id from app.organizations where external_key=$1 and status=$2', [body.organization_external_key, 'active'])).rows[0];
        } else {
          organization = (await client.query('select id from app.organizations where slug=$1 and status=$2', [body.organization_slug, 'active'])).rows[0];
        }
        if (!organization) { const error = new Error('Organization not found'); error.status = 404; throw error; }

        let employee;
        if (body.employee_id) {
          employee = (await client.query('select id from app.employees where organization_id=$1 and id=$2 and status<>$3', [organization.id, body.employee_id, 'archived'])).rows[0];
        } else {
          const external = String(body.employee_external_key);
          employee = (await client.query(`insert into app.employees (organization_id, external_key, display_name, job_role)
            values ($1,$2,$3,$4)
            on conflict (organization_id, external_key) do update set
              display_name=excluded.display_name, job_role=excluded.job_role, updated_at=now()
            returning id`, [organization.id, external, String(body.employee_name || external).slice(0,160), String(body.role || 'general').slice(0,120)])).rows[0];
        }
        if (!employee) { const error = new Error('Employee not found'); error.status = 404; throw error; }

        let deviceId = null;
        if (body.device_name) {
          const existing = await client.query('select id from app.devices where organization_id=$1 and device_name=$2 order by created_at desc limit 1', [organization.id, String(body.device_name).slice(0,255)]);
          if (existing.rowCount) deviceId = existing.rows[0].id;
          else {
            const tokenHash = crypto.createHash('sha256').update(`${organization.id}:${body.device_name}:${Date.now()}:${crypto.randomUUID()}`).digest('hex');
            deviceId = (await client.query(`insert into app.devices (organization_id, device_name, fingerprint, token_hash, status, last_seen_at)
              values ($1,$2,$3,$4,'active',now()) returning id`, [organization.id, String(body.device_name).slice(0,255), body.device_fingerprint ? String(body.device_fingerprint).slice(0,255) : null, tokenHash])).rows[0].id;
          }
          await client.query('update app.devices set last_seen_at=now(), updated_at=now() where organization_id=$1 and id=$2', [organization.id, deviceId]);
          const assignment = await client.query('select 1 from app.employee_device_assignments where organization_id=$1 and employee_id=$2 and device_id=$3 and unassigned_at is null limit 1', [organization.id, employee.id, deviceId]);
          if (!assignment.rowCount) await client.query('insert into app.employee_device_assignments (organization_id, employee_id, device_id) values ($1,$2,$3)', [organization.id, employee.id, deviceId]);
        }

        const startedAt = validDate(body.started_at);
        const endedAt = body.ended_at ? validDate(body.ended_at) : null;
        const session = (await client.query(`insert into app.work_sessions
          (organization_id, employee_id, device_id, external_session_id, status, started_at, ended_at, total_minutes, claimed_task, storage_prefix, source_version)
          values ($1,$2,$3,$4,'processing',$5,$6,$7,$8,$9,$10)
          on conflict (organization_id, external_session_id) do update set
            employee_id=excluded.employee_id, device_id=excluded.device_id, status='processing',
            started_at=excluded.started_at, ended_at=excluded.ended_at, total_minutes=excluded.total_minutes,
            claimed_task=excluded.claimed_task, storage_prefix=excluded.storage_prefix,
            source_version=excluded.source_version, updated_at=now()
          returning id`, [organization.id, employee.id, deviceId, String(body.external_session_id), startedAt, endedAt,
            body.total_duration_seconds ? Number(body.total_duration_seconds) / 60 : null,
            body.task ? String(body.task).slice(0,500) : null, rawPath, String(body.source_version || 'structured-v1').slice(0,80)])).rows[0];

        const fingerprint = String(body.source_fingerprint || crypto.createHash('sha256').update(JSON.stringify(body.summary || {})).update(String(body.events?.length || 0)).digest('hex')).slice(0,160);
        const dedupe = `${organization.id}:${body.external_session_id}:${fingerprint}`;
        const job = await client.query(`insert into app.background_jobs (job_type, priority, payload, dedupe_key)
          values ('SessionNormalization',1,$1,$2)
          on conflict (dedupe_key) do update set
            payload=excluded.payload, status='pending', attempts=0, run_after=now(), started_at=null,
            completed_at=null, error_message=null, result=null
          returning id,status`, [{ organization_id: organization.id, employee_id: employee.id, session_id: session.id, raw_path: rawPath }, dedupe]);
        return { organization_id: organization.id, employee_id: employee.id, session_id: session.id, worker_job_id: job.rows[0].id };
      });
      return res.status(202).json({ ...result, status: 'ingesting' });
    } catch (error) {
      console.error('[ingest/session]', error.message);
      return res.status(error.status || 500).json({ error: error.status ? error.message : 'Session ingestion failed' });
    }
  });
  return router;
}

module.exports = { createIngestionRouter, validate };