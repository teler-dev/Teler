# TELER modular-monolith backend

TELER keeps Express on one Oracle Free VM and adds one resource-bounded Node worker. PostgreSQL/Neon is the queryable source for normalized telemetry, analytics and alerts; `/opt/teler/data` remains the raw evidence/archive and legacy fallback.

## Runtime

- `teler-api.service`: HTTP only, legacy routes plus `/api/v1/*`.
- `teler-worker.service`: consumes `app.background_jobs` with `FOR UPDATE SKIP LOCKED`.
- Caddy: TLS/reverse proxy.
- Neon/PostgreSQL: metadata, normalized telemetry, daily aggregates, persisted alerts and jobs.
- `/opt/teler/data`: original tracker files, screenshots and structured ingest archives.

No Redis, Celery, ClickHouse, RabbitMQ or microservice split is required for this stage.

## Structured path

1. Tracker continues writing local crash-safe files.
2. Sync agent uploads raw evidence exactly as before.
3. For completed/recovered sessions the sync agent also posts master + events metadata to `/api/v1/ingest/session`.
4. API validates identity/timestamps/size, resolves organization + employee, archives the payload, upserts `app.work_sessions`, and enqueues `SessionNormalization` idempotently.
5. Worker precomputes app usage, minute metrics, focus/distraction/idle blocks, session metrics, daily metrics and alerts.
6. New `/api/v1/sessions`, `/api/v1/analytics/*`, and `/api/v1/alerts` query PostgreSQL directly.
7. Existing `/api/sessions`, `/api/employee/*`, `/api/memory/*` continue using files, so rollout is shadow-mode and reversible.

## Database rollout

Apply `database/001_initial_multitenant.sql` and `database/003_desktop_auth.sql` once. `deploy/setup-server.sh` runs the idempotent `database/004_backend_evolution.sql` automatically when `DATABASE_URL` is configured and the base schema exists.

## Rollback

Stop the worker with `sudo systemctl stop teler-worker`. Existing dashboard routes still read the historical filesystem implementation. The structured archive and normalized database rows are additive; no legacy tracker files are deleted.

## Operations

- API logs: `journalctl -u teler-api -f`
- Worker logs: `journalctl -u teler-worker -f`
- Failed jobs: query `app.background_jobs` where `status='failed'`.
- Queue depth: count jobs with `status in ('pending','retrying','running')`.
- Health endpoint reports DB/worker queue availability without exposing credentials.