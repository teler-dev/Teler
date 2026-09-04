'use strict';

const { getPool, withTransaction } = require('../db');
const SUPPORTED = new Set(['sessions','screenshots','alerts']);

function createSettingsRouter(express) {
  const router = express.Router();

  router.get('/retention', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query('select resource_type,retention_days,auto_delete,updated_at from app.data_retention_policies where organization_id=$1 order by resource_type', [organizationId]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/settings/retention]', error.message); res.status(500).json({ error: 'Unable to load retention settings' }); }
  });

  router.patch('/retention', async (req, res) => {
    const pool = getPool();
    const body = req.body || {};
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    if (!body.organization_id || !SUPPORTED.has(body.resource_type)) return res.status(400).json({ error: 'organization_id and supported resource_type are required' });
    const days = Number(body.retention_days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return res.status(400).json({ error: 'retention_days must be 1..3650' });
    try {
      const result = await pool.query(`insert into app.data_retention_policies (organization_id,resource_type,retention_days,auto_delete)
        values ($1,$2,$3,$4) on conflict (organization_id,resource_type) do update set retention_days=excluded.retention_days,auto_delete=excluded.auto_delete,updated_at=now()
        returning *`, [body.organization_id, body.resource_type, days, Boolean(body.auto_delete)]);
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/settings/retention/update]', error.message); res.status(500).json({ error: 'Unable to update retention settings' }); }
  });

  router.post('/retention/run', async (req, res) => {
    const body = req.body || {};
    if (!body.organization_id) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await withTransaction(async client => {
        const job = (await client.query(`insert into app.background_jobs (job_type,priority,payload)
          values ('DataRetentionCleanup',-1,$1) returning id`, [{ organization_id: body.organization_id }])).rows[0];
        return job.id;
      });
      res.status(202).json({ worker_job_id: result, status: 'queued' });
    } catch (error) { console.error('[v1/settings/retention/run]', error.message); res.status(500).json({ error: 'Unable to queue retention cleanup' }); }
  });

  return router;
}

module.exports = { createSettingsRouter };