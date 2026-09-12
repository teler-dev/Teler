'use strict';
const { getPool } = require('../db');

function canManage(user) { return ['owner', 'admin'].includes(String(user?.organization?.role || '').toLowerCase()); }
function requireManager(req, res) {
  if (canManage(req.authUser)) return true;
  res.status(403).json({ error: 'Only workspace administrators can manage the AI analysis queue' });
  return false;
}
function createAiReportsRouter(express) {
  const router = express.Router();
  router.get('/queue', async (req, res) => {
    if (!requireManager(req, res)) return;
    const pool = getPool(); if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const result = await pool.query(`select s.id as session_id,s.employee_id,e.display_name as employee_name,s.started_at,
          s.total_duration_seconds,count(sc.id)::int as screenshot_count,coalesce(r.status,'pending') as analysis_status,
          r.error_message
        from app.work_sessions s
        join app.employees e on e.organization_id=s.organization_id and e.id=s.employee_id
        join app.screenshots sc on sc.organization_id=s.organization_id and sc.session_id=s.id
        left join app.session_ai_reports r on r.organization_id=s.organization_id and r.session_id=s.id
        where s.organization_id=$1 and s.status='complete'
          and coalesce(r.status,'pending') in ('pending','failed','insufficient_evidence')
          and not exists (select 1 from app.background_jobs j where j.job_type='EvidenceAiAnalysis'
            and j.status in ('pending','retrying','running') and j.payload->>'session_id'=s.id::text)
        group by s.id,s.employee_id,e.display_name,s.started_at,s.total_duration_seconds,r.status,r.error_message
        order by s.started_at desc limit 200`, [req.authUser.organization.id]);
      return res.json({ data: result.rows });
    } catch (error) { console.error('[ai-reports/queue]', error.message); return res.status(500).json({ error: 'Unable to load AI analysis queue' }); }
  });
  router.post('/queue', async (req, res) => {
    if (!requireManager(req, res)) return;
    const ids = [...new Set(Array.isArray(req.body?.session_ids) ? req.body.session_ids.map(String) : [])]
      .filter(value => /^[a-f0-9-]{36}$/i.test(value)).slice(0, 25);
    if (!ids.length) return res.status(400).json({ error: 'Select at least one valid session' });
    const pool = getPool(); if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const sessions = await pool.query(`select s.id,s.organization_id,s.employee_id
        from app.work_sessions s where s.organization_id=$1 and s.status='complete' and s.id=any($2::uuid[])
          and exists (select 1 from app.screenshots sc where sc.organization_id=s.organization_id and sc.session_id=s.id)`,
      [req.authUser.organization.id, ids]);
      const queued = [];
      for (const session of sessions.rows) {
        const active = await pool.query(`select 1 from app.background_jobs where job_type='EvidenceAiAnalysis'
          and status in ('pending','retrying','running') and payload->>'session_id'=$1 limit 1`, [session.id]);
        if (active.rowCount) continue;
        const job = await pool.query(`insert into app.background_jobs (job_type,priority,payload,dedupe_key)
          values ('EvidenceAiAnalysis',2,$1,$2) returning id`, [
          { organization_id: session.organization_id, employee_id: session.employee_id, session_id: session.id },
          `manual-evidence-ai:${session.id}:${Date.now()}:${queued.length}`,
        ]);
        queued.push({ session_id: session.id, worker_job_id: job.rows[0].id });
      }
      return res.status(202).json({ data: { queued, skipped: ids.length - queued.length } });
    } catch (error) { console.error('[ai-reports/queue/submit]', error.message); return res.status(500).json({ error: 'Unable to queue AI analysis' }); }
  });
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
