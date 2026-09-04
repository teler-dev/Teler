'use strict';

const { getPool } = require('../db');

function createAnalyticsRouter(express) {
  const router = express.Router();
  router.get('/company/:organizationId/daily', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const limit = Math.min(366, Math.max(1, Number(req.query.limit) || 31));
    try {
      const result = await pool.query(`select d.metric_date,d.employee_id,e.display_name as employee_name,d.session_count,
        d.total_duration_seconds,d.key_count,d.click_count,d.app_switches,d.idle_seconds,d.focus_seconds,
        d.distraction_seconds,d.avg_productivity_score
        from app.session_metrics_daily d join app.employees e on e.organization_id=d.organization_id and e.id=d.employee_id
        where d.organization_id=$1 and ($2::date is null or d.metric_date >= $2::date) and ($3::date is null or d.metric_date <= $3::date)
        order by d.metric_date desc,e.display_name limit $4`, [req.params.organizationId, req.query.start || null, req.query.end || null, limit]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/analytics]', error.message); res.status(500).json({ error: 'Unable to load analytics' }); }
  });
  router.get('/employee/:employeeId/trends', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query(`select metric_date,session_count,total_duration_seconds,idle_seconds,focus_seconds,
        distraction_seconds,app_switches,avg_productivity_score from app.session_metrics_daily
        where organization_id=$1 and employee_id=$2 order by metric_date desc limit 90`, [organizationId, req.params.employeeId]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/analytics/trends]', error.message); res.status(500).json({ error: 'Unable to load employee trends' }); }
  });
  return router;
}

module.exports = { createAnalyticsRouter };