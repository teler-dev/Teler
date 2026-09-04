'use strict';

const { getPool, withTransaction } = require('../db');

function createReportsRouter(express) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query(`select id,report_type,title,date_start,date_end,status,created_at,updated_at from app.reports where organization_id=$1 order by created_at desc limit 100`, [organizationId]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/reports]', error.message); res.status(500).json({ error: 'Unable to load reports' }); }
  });

  router.post('/generate', async (req, res) => {
    const body = req.body || {};
    if (!body.organization_id || !body.report_type) return res.status(400).json({ error: 'organization_id and report_type are required' });
    try {
      const result = await withTransaction(async client => {
        const report = (await client.query(`insert into app.reports (organization_id,report_type,title,generated_by,date_start,date_end,status)
          values ($1,$2,$3,$4,$5,$6,'draft') returning id`,
          [body.organization_id, String(body.report_type).slice(0,100), String(body.title || 'TELER workforce report').slice(0,255), body.generated_by || null, body.date_start || null, body.date_end || null])).rows[0];
        const job = (await client.query(`insert into app.background_jobs (job_type,priority,payload,dedupe_key)
          values ('ReportGeneration',0,$1,$2) returning id`, [{ organization_id: body.organization_id, report_id: report.id }, `report:${report.id}`])).rows[0];
        return { report_id: report.id, worker_job_id: job.id };
      });
      res.status(202).json({ ...result, status: 'queued' });
    } catch (error) { console.error('[v1/reports/generate]', error.message); res.status(500).json({ error: 'Unable to queue report' }); }
  });

  router.get('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query('select * from app.reports where organization_id=$1 and id=$2', [organizationId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Report not found' });
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/report]', error.message); res.status(500).json({ error: 'Unable to load report' }); }
  });

  return router;
}

module.exports = { createReportsRouter };