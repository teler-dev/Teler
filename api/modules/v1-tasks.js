'use strict';

const { getPool } = require('../db');
const STATUSES = new Set(['todo','in_progress','completed','blocked','archived']);
const PRIORITIES = new Set(['low','medium','high','urgent']);

async function audit(pool, organizationId, action, entityId, metadata = {}) {
  await pool.query(`insert into app.audit_logs (organization_id,action,entity_type,entity_id,metadata) values ($1,$2,'task',$3,$4)`, [organizationId, action, entityId, metadata]).catch(() => {});
}

function createTasksRouter(express) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    try {
      const result = await pool.query(`select t.*,p.name as project_name,e.display_name as assignee_name from app.tasks t
        left join app.projects p on p.organization_id=t.organization_id and p.id=t.project_id
        left join app.employees e on e.organization_id=t.organization_id and e.id=t.assigned_to
        where t.organization_id=$1 and ($2::text is null or t.status=$2) and ($3::uuid is null or t.assigned_to=$3)
        order by case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,t.due_at nulls last,t.created_at desc limit $4`,
        [organizationId, req.query.status || null, req.query.assigned_to || null, limit]);
      res.json({ data: result.rows });
    } catch (error) { console.error('[v1/tasks]', error.message); res.status(500).json({ error: 'Unable to load tasks' }); }
  });

  router.post('/', async (req, res) => {
    const pool = getPool();
    const body = req.body || {};
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    if (!body.organization_id || !String(body.title || '').trim()) return res.status(400).json({ error: 'organization_id and title are required' });
    const status = STATUSES.has(body.status) ? body.status : 'todo';
    const priority = PRIORITIES.has(body.priority) ? body.priority : 'medium';
    try {
      const result = await pool.query(`insert into app.tasks
        (organization_id,project_id,assigned_to,created_by,title,description,status,priority,due_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [body.organization_id, body.project_id || null, body.assigned_to || null, body.created_by || null, String(body.title).trim().slice(0,255), body.description || null, status, priority, body.due_at || null]);
      await audit(pool, body.organization_id, 'create', result.rows[0].id, { status, priority });
      res.status(201).json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/tasks/create]', error.message); res.status(500).json({ error: 'Unable to create task' }); }
  });

  router.get('/:id', async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    const organizationId = req.query.organization_id;
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query('select * from app.tasks where organization_id=$1 and id=$2', [organizationId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/task]', error.message); res.status(500).json({ error: 'Unable to load task' }); }
  });

  router.patch('/:id', async (req, res) => {
    const pool = getPool();
    const body = req.body || {};
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    if (!body.organization_id) return res.status(400).json({ error: 'organization_id is required' });
    if (body.status && !STATUSES.has(body.status)) return res.status(400).json({ error: 'Invalid status' });
    if (body.priority && !PRIORITIES.has(body.priority)) return res.status(400).json({ error: 'Invalid priority' });
    try {
      const result = await pool.query(`update app.tasks set
        title=coalesce($3,title),description=coalesce($4,description),status=coalesce($5,status),priority=coalesce($6,priority),
        assigned_to=case when $7::boolean then $8::uuid else assigned_to end,due_at=case when $9::boolean then $10::timestamptz else due_at end,
        completed_at=case when coalesce($5,status)='completed' then coalesce(completed_at,now()) else null end,updated_at=now()
        where organization_id=$1 and id=$2 returning *`,
        [body.organization_id, req.params.id, body.title ? String(body.title).trim().slice(0,255) : null, body.description ?? null, body.status || null, body.priority || null,
         Object.prototype.hasOwnProperty.call(body,'assigned_to'), body.assigned_to || null, Object.prototype.hasOwnProperty.call(body,'due_at'), body.due_at || null]);
      if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
      await audit(pool, body.organization_id, 'update', req.params.id, { status: body.status, priority: body.priority });
      res.json({ data: result.rows[0] });
    } catch (error) { console.error('[v1/tasks/update]', error.message); res.status(500).json({ error: 'Unable to update task' }); }
  });

  router.delete('/:id', async (req, res) => {
    const pool = getPool();
    const organizationId = req.query.organization_id;
    if (!pool) return res.status(503).json({ error: 'Database is not configured' });
    if (!organizationId) return res.status(400).json({ error: 'organization_id is required' });
    try {
      const result = await pool.query(`update app.tasks set status='archived',updated_at=now() where organization_id=$1 and id=$2 returning id`, [organizationId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
      await audit(pool, organizationId, 'archive', req.params.id);
      res.status(204).end();
    } catch (error) { console.error('[v1/tasks/archive]', error.message); res.status(500).json({ error: 'Unable to archive task' }); }
  });

  return router;
}

module.exports = { createTasksRouter };