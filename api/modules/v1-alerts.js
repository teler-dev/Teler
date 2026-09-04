'use strict';

const { getPool } = require('../db');
const ALERT_STATUSES = new Set(['open','acknowledged','resolved','dismissed']);
const SEVERITIES = new Set(['info','low','medium','high','critical','warning']);

function createAlertsRouter(express) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    try {
      const result = await pool.query(`select a.*,e.display_name as employee_name from app.alerts a
        join app.employees e on e.organization_id=a.organization_id and e.id=a.employee_id
        where a.organization_id=$1 and ($2::text is null or a.status=$2) and ($3::text is null or a.severity=$3)
        order by a.created_at desc limit $4`, [organizationId, req.query.status || null, req.query.severity || null, limit]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/alerts]', error.message); res.status(500).json({ error: 'Unable to load alerts' }); }
  });

  router.get('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query(`select a.*,e.display_name as employee_name from app.alerts a join app.employees e on e.organization_id=a.organization_id and e.id=a.employee_id where a.organization_id=$1 and a.id=$2`, [organizationId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Alert not found' });
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/alert]', error.message); res.status(500).json({ error: 'Unable to load alert' }); }
  });

  router.patch('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.body?.organization_id;
    const status = req.body?.status;
    const severity = req.body?.severity;
    if (!organizationId || (status && !ALERT_STATUSES.has(status)) || (severity && !SEVERITIES.has(severity))) return res.status(400).json({ error: 'organization_id and valid status/severity are required' });
    if (!status && !severity) return res.status(400).json({ error: 'status or severity is required' });
    try {
      const result = await pool.query(`update app.alerts set status=coalesce($3,status),severity=coalesce($4,severity),
        resolved_at=case when coalesce($3,status)='resolved' then coalesce(resolved_at,now()) else null end,updated_at=now()
        where organization_id=$1 and id=$2 returning *`, [organizationId, req.params.id, status || null, severity || null]);
      if (!result.rowCount) return res.status(404).json({ error: 'Alert not found' });
      await pool.query(`insert into app.audit_logs (organization_id,action,entity_type,entity_id,metadata) values ($1,'update','alert',$2,$3)`, [organizationId, req.params.id, { status, severity }]).catch(() => {});
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/alerts/update]', error.message); res.status(500).json({ error: 'Unable to update alert' }); }
  });
  return router;
}

function createAlertRulesRouter(express) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query('select * from app.alert_rules where organization_id=$1 order by created_at desc', [organizationId]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/alert-rules]', error.message); res.status(500).json({ error: 'Unable to load alert rules' }); }
  });
  router.post('/', async (req, res) => {
    const pool = getPool();
    const body = req.body || {};
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    if (!body.organization_id || !body.name || !body.rule_type) return res.status(400).json({ error: 'organization_id, name and rule_type are required' });
    const severity = SEVERITIES.has(body.severity) ? body.severity : 'warning';
    try {
      const result = await pool.query(`insert into app.alert_rules (organization_id,name,rule_type,condition,severity,enabled) values ($1,$2,$3,$4,$5,$6) returning *`,
        [body.organization_id, String(body.name).slice(0,255), String(body.rule_type).slice(0,100), body.condition || {}, severity, body.enabled !== false]);
      res.status(201).json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/alert-rules/create]', error.message); res.status(500).json({ error: 'Unable to create alert rule' }); }
  });
  router.patch('/:id', async (req, res) => {
    const pool = getPool();
    const body = req.body || {};
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    if (!body.organization_id) return res.status(400).json({ error: 'organization_id is required' });
    if (body.severity && !SEVERITIES.has(body.severity)) return res.status(400).json({ error: 'Invalid severity' });
    try {
      const result = await pool.query(`update app.alert_rules set name=coalesce($3,name),condition=coalesce($4,condition),severity=coalesce($5,severity),
        enabled=coalesce($6,enabled),updated_at=now() where organization_id=$1 and id=$2 returning *`,
        [body.organization_id, req.params.id, body.name || null, body.condition || null, body.severity || null, typeof body.enabled === 'boolean' ? body.enabled : null]);
      if (!result.rowCount) return res.status(404).json({ error: 'Alert rule not found' });
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/alert-rules/update]', error.message); res.status(500).json({ error: 'Unable to update alert rule' }); }
  });
  router.delete('/:id', async (req, res) => {
    const pool = getPool();
    const organizationId = req.query.organization_id;
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query('delete from app.alert_rules where organization_id=$1 and id=$2 returning id', [organizationId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Alert rule not found' });
      res.status(204).end();
    } catch (error) { console.error('[v1/alert-rules/delete]', error.message); res.status(500).json({ error: 'Unable to delete alert rule' }); }
  });
  return router;
}

module.exports = { createAlertsRouter, createAlertRulesRouter };