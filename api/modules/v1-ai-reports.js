'use strict';
const { getPool } = require('../db');

function canManage(user) { return ['owner', 'admin'].includes(String(user?.organization?.role || '').toLowerCase()); }
function createAiReportsRouter(express) {
  const router = express.Router();
  router.get('/sessions/:id', async (req, res) => {
    const pool = getPool(); if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const report = await pool.query(`select r.*, coalesce(json_agg(json_build_object('screenshot_id',f.screenshot_id,'summary',f.summary,'confidence',f.confidence,'observed_signals',f.observed_signals,'status',f.status) order by f.created_at) filter (where f.id is not null),'[]') as findings
        from app.session_ai_reports r left join app.screenshot_ai_findings f on f.organization_id=r.organization_id and f.session_id=r.session_id
        join app.work_sessions s on s.organization_id=r.organization_id and s.id=r.session_id
        where r.organization_id=$1 and r.session_id=$2${canManage(req.authUser) ? '' : ' and s.user_profile_id=$3'} group by r.id`,
      canManage(req.authUser) ? [req.authUser.organization.id, req.params.id] : [req.authUser.organization.id, req.params.id, req.authUser.id]);
      if (!report.rowCount) return res.status(404).json({ error: 'AI report not found' });
      return res.json({ data: report.rows[0] });
    } catch (error) { console.error('[ai-reports/session]', error.message); return res.status(500).json({ error: 'Unable to load AI report' }); }
  });
  router.get('/daily', async (req, res) => {
    const pool = getPool(); if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const employeeId = String(req.query.employee_id || ''); const date = String(req.query.date || '');
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'employee_id and YYYY-MM-DD date are required' });
    try {
      const result = await pool.query(`select * from app.daily_ai_reports where organization_id=$1 and employee_id=$2 and report_date=$3${canManage(req.authUser) ? '' : ' and employee_id=$4'} limit 1`,
        canManage(req.authUser) ? [req.authUser.organization.id, employeeId, date] : [req.authUser.organization.id, employeeId, date, req.authUser.employeeId]);
      return res.json({ data: result.rows[0] || null });
    } catch (error) { console.error('[ai-reports/daily]', error.message); return res.status(500).json({ error: 'Unable to load daily AI report' }); }
  });
  return router;
}
module.exports = { createAiReportsRouter };
