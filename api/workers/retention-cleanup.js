'use strict';

const fs = require('fs');
const path = require('path');
const { getPool, withTransaction } = require('../db');
const BASE = path.resolve(process.env.DATA_ROOT || (process.platform === 'win32' ? path.join(process.cwd(),'data') : '/opt/teler/data'));

function safeDelete(relativeOrAbsolute) {
  if (!relativeOrAbsolute) return false;
  const resolved = path.resolve(path.isAbsolute(relativeOrAbsolute) ? relativeOrAbsolute : path.join(BASE, relativeOrAbsolute));
  if (resolved !== BASE && !resolved.startsWith(`${BASE}${path.sep}`)) return false;
  try { if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true, force: true }); return true; }
  catch { return false; }
}

async function processRetentionCleanup(payload) {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  const outcome = await withTransaction(async client => {
    const policies = await client.query(`select resource_type,retention_days from app.data_retention_policies where organization_id=$1 and auto_delete=true`, [payload.organization_id]);
    const result = { organization_id: payload.organization_id, deleted: {}, file_paths: [] };
    for (const policy of policies.rows) {
      if (policy.resource_type === 'alerts') {
        const deleted = await client.query(`delete from app.alerts where organization_id=$1 and status in ('resolved','dismissed') and created_at < now()-($2 || ' days')::interval returning id`, [payload.organization_id, String(policy.retention_days)]);
        result.deleted.alerts = deleted.rowCount;
      } else if (policy.resource_type === 'screenshots') {
        const rows = await client.query(`delete from app.screenshots where organization_id=$1 and created_at < now()-($2 || ' days')::interval returning storage_path,thumbnail_path`, [payload.organization_id, String(policy.retention_days)]);
        rows.rows.forEach(row => result.file_paths.push(row.storage_path, row.thumbnail_path));
        result.deleted.screenshots = rows.rowCount;
      } else if (policy.resource_type === 'sessions') {
        const rows = await client.query(`delete from app.work_sessions where organization_id=$1 and coalesce(ended_at,started_at) < now()-($2 || ' days')::interval returning storage_prefix`, [payload.organization_id, String(policy.retention_days)]);
        rows.rows.forEach(row => result.file_paths.push(row.storage_prefix));
        result.deleted.sessions = rows.rowCount;
      }
    }
    await client.query(`insert into app.audit_logs (organization_id,action,entity_type,metadata) values ($1,'retention_cleanup','retention_policy',$2)`, [payload.organization_id, { deleted: result.deleted }]);
    return result;
  });

  // Files are removed only after the database transaction has committed. A DB
  // rollback therefore never leaves metadata pointing at evidence already lost.
  const uniquePaths = [...new Set(outcome.file_paths.filter(Boolean))];
  const filesDeleted = uniquePaths.reduce((count, candidate) => count + (safeDelete(candidate) ? 1 : 0), 0);
  return { organization_id: outcome.organization_id, deleted: outcome.deleted, files_deleted: filesDeleted };
}

module.exports = { processRetentionCleanup, safeDelete };