# TELER persistent multi-tenant architecture

Status: proposed foundation (v1)  
Database: Neon PostgreSQL  
Authentication: Neon Auth  
Large-object storage: Oracle VM initially; object storage later

## 1. Ownership boundaries

| System | Owns |
|---|---|
| Neon Auth (`neon_auth` schema) | Passwords, identities, login sessions, verification and reset flows |
| TELER PostgreSQL (`app` schema) | Organizations, memberships, roles, employees, devices, session metadata, metrics, subscriptions and audit history |
| Oracle storage | Screenshots, OCR, raw events, JSON/JSONL telemetry and generated report files |
| Vercel Functions | Session validation, tenant resolution, authorization and calls to Neon/Oracle/OpenRouter |
| Windows tracker | Captures telemetry and uploads with a device-specific credential |

Never duplicate password hashes in TELER tables. `app.user_profiles.auth_user_id`
stores the stable Neon Auth user ID without a foreign key into provider-managed
tables.

## 2. Tenant boundary

`organization_id` is mandatory on every tenant-owned table. A request follows:

```text
Neon Auth session
    → auth_user_id
    → organization_memberships
    → active organization_id + role
    → authorized PostgreSQL query / Oracle storage prefix
```

The client must never supply an unrestricted organization ID. Vercel resolves
the requested organization against the logged-in user's active memberships.
Every Oracle path uses this prefix:

```text
organizations/{organization_id}/employees/{employee_id}/sessions/{session_id}/...
```

## 3. Core data model

```text
organizations
 ├── organization_memberships ── user_profiles
 ├── invitations
 ├── organization_settings
 ├── employees
 │    ├── employee_device_assignments ── devices
 │    └── work_sessions
 │          ├── session_metrics
 │          └── artifacts
 ├── subscriptions
 └── audit_logs
```

Roles:

- `owner`: billing, organization deletion, all administration
- `admin`: members, employees, devices and all reports
- `manager`: assigned employee/team reports
- `viewer`: read-only permitted dashboards

Tracker device tokens are random credentials stored only as hashes. They are
not dashboard login tokens and must be revocable per device.

## 4. What belongs in PostgreSQL

Store relational, searchable and transactional data:

- tenant/user/role membership
- employee and device identity
- one row per tracked session
- aggregated scores and minutes
- storage object paths, hashes, sizes and retention dates
- billing state and plan limits
- immutable security/audit events

Do not store high-volume screenshots, raw events or OCR blobs in PostgreSQL.
Those stay in Oracle storage; `app.artifacts` stores their metadata and path.

## 5. Request and sync flows

### Dashboard

1. User signs in through Neon Auth.
2. Vercel validates the secure session.
3. Vercel loads active memberships and selects an allowed organization.
4. Queries always include the resolved `organization_id`.
5. Screenshot requests verify the artifact belongs to that organization before
   proxying the Oracle file.

### Tracker sync

1. Device sends its device ID and secret over HTTPS.
2. API hashes the secret and compares it to `devices.token_hash`.
3. API derives organization/employee from the device assignment; it never
   trusts tenant or employee identity supplied by the tracker.
4. Raw file is saved under the tenant storage prefix.
5. Session metadata and aggregates are upserted into Neon using
   `(organization_id, external_session_id)` as the idempotency key.

## 6. Security and persistence rules

- Use pooled Neon connection string only in server-side Vercel/Oracle env vars.
- Enable PostgreSQL RLS before any direct browser Data API access.
- Backend authorization remains mandatory even when RLS is enabled.
- Store API/device tokens as SHA-256 or HMAC hashes, never plaintext.
- Unique and foreign-key constraints include `organization_id` wherever
  practical to prevent cross-tenant references.
- Audit login, invitation, membership, device, export and billing changes.
- Soft-disable users/employees/devices; avoid destructive deletion of evidence.
- Define tenant retention (`raw_retention_days`, `screenshot_retention_days`).
- Back up Neon metadata and Oracle artifacts separately; test restore quarterly.

## 7. Delivery order

1. Create Neon project and enable Neon Auth.
2. Apply `database/001_initial_multitenant.sql`.
3. Create the initial Neon Auth identity and apply
   `database/002_seed_first_owner.sql` with its Auth User ID.
4. Replace the temporary single-user Vercel auth with Neon Auth.
5. Add organization creation, invitation and active-organization selection.
6. Issue per-device sync credentials and tenant-scoped storage paths.
7. Dual-write discovered session metadata to Neon while keeping current files.
8. Switch dashboard list/filter/report queries to Neon.
9. Add billing limits, retention jobs and audit views.

This design allows the existing Oracle file pipeline to continue during the
migration; no bulk telemetry rewrite is required on day one.
