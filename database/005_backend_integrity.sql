-- TELER backend integrity corrections applied after 004_backend_evolution.sql.
-- Keeps organization_id intact when an assigned employee is deleted.

begin;

alter table app.tasks
  drop constraint if exists tasks_organization_id_assigned_to_fkey;

alter table app.tasks
  add constraint tasks_organization_id_assigned_to_fkey
  foreign key (organization_id, assigned_to)
  references app.employees(organization_id, id)
  on delete set null (assigned_to);

commit;