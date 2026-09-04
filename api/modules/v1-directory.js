'use strict';

const { getPool } = require('../db');

function createDirectoryRouter(express) {
  const router = express.Router();

  router.get('/companies', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const result = await pool.query(`select id,external_key,slug,name,status,created_at,updated_at from app.organizations
        where ($1::text is null or external_key=$1 or slug=$1) order by name`, [req.query.key || null]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/companies]', error.message); res.status(500).json({ error: 'Unable to load companies' }); }
  });

  router.get('/companies/:organizationId/employees', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const result = await pool.query(`select id,external_key,display_name,email_normalized,job_role,department,status,created_at,updated_at
        from app.employees where organization_id=$1 and ($2::text is null or status::text=$2)
        order by display_name`, [req.params.organizationId, req.query.status || null]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/employees]', error.message); res.status(500).json({ error: 'Unable to load employees' }); }
  });

  router.get('/employees/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const employee = await pool.query(`select * from app.employees where organization_id=$1 and id=$2`, [organizationId, req.params.id]);
      if (!employee.rowCount) return res.status(404).json({ error: 'Employee not found' });
      const devices = await pool.query(`select d.id,d.device_name,d.fingerprint,d.status,d.last_seen_at
        from app.employee_device_assignments a join app.devices d on d.organization_id=a.organization_id and d.id=a.device_id
        where a.organization_id=$1 and a.employee_id=$2 and a.unassigned_at is null order by d.last_seen_at desc nulls last`, [organizationId, req.params.id]);
      res.json({ data: { ...employee.rows[0], devices: devices.rows } });
    } catch (error) { console.error('[v1/employee]', error.message); res.status(500).json({ error: 'Unable to load employee' }); }
  });

  router.get('/companies/:organizationId/devices', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    try {
      const result = await pool.query(`select d.id,d.device_name,d.fingerprint,d.status,d.last_seen_at,d.created_at,
        e.id as employee_id,e.display_name as employee_name
        from app.devices d left join app.employee_device_assignments a
          on a.organization_id=d.organization_id and a.device_id=d.id and a.unassigned_at is null
        left join app.employees e on e.organization_id=a.organization_id and e.id=a.employee_id
        where d.organization_id=$1 order by d.last_seen_at desc nulls last`, [req.params.organizationId]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/devices]', error.message); res.status(500).json({ error: 'Unable to load devices' }); }
  });

  router.get('/devices/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query(`select id,device_name,fingerprint,status,last_seen_at,created_at,updated_at from app.devices where organization_id=$1 and id=$2`, [organizationId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Device not found' });
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/device]', error.message); res.status(500).json({ error: 'Unable to load device' }); }
  });

  return router;
}

module.exports = { createDirectoryRouter };