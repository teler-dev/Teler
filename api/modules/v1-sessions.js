'use strict';

const { getPool } = require('../db');

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
        ws.started_at,ws.ended_at,ws.total_minutes,ws.status,sm.productivity_score,sm.active_minutes,sm.idle_minutes,
        sm.deep_work_minutes,sm.app_switch_count,sm.key_count,sm.mouse_clicks
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

module.exports = { createSessionsRouter };