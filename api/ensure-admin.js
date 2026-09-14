'use strict';

/**
 * Idempotent admin/workspace bootstrap.
 *
 * Ensures the shared organization exists and that a given email is its active
 * OWNER with a usable password. New signups then join this organization (see
 * TELER_DEFAULT_ORG_SLUG in auth.js), and this owner sees everyone in the portal.
 *
 * Usage (from the api/ directory, with DATABASE_URL set):
 *   TELER_ADMIN_PASSWORD='choose-a-strong-one' node ensure-admin.js
 *
 * Environment:
 *   DATABASE_URL              required — Postgres/Neon connection string
 *   TELER_ADMIN_PASSWORD      required — password for the admin account
 *   TELER_ADMIN_EMAIL         default admin@teler.local
 *   TELER_ADMIN_NAME          default 'TELER Admin'
 *   TELER_DEFAULT_ORG_SLUG    default 'teler'
 *   TELER_DEFAULT_ORG_NAME    default 'TELER'
 *   TELER_ADMIN_RESET_PASSWORD set to '1' to overwrite an existing password
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const { hashPassword } = require('./auth');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const EMAIL = (process.env.TELER_ADMIN_EMAIL || 'admin@teler.local').trim().toLowerCase();
const NAME = (process.env.TELER_ADMIN_NAME || 'TELER Admin').trim();
const PASSWORD = String(process.env.TELER_ADMIN_PASSWORD || '');
const ORG_SLUG = (process.env.TELER_DEFAULT_ORG_SLUG || 'teler').trim().toLowerCase();
const ORG_NAME = (process.env.TELER_DEFAULT_ORG_NAME || 'TELER').trim();
const RESET_PASSWORD = process.env.TELER_ADMIN_RESET_PASSWORD === '1';

async function main() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
  if (PASSWORD.length < 8) throw new Error('TELER_ADMIN_PASSWORD must be at least 8 characters');

  const pool = new Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 8_000 });
  const client = await pool.connect();
  try {
    await client.query('begin');

    // 1. Shared organization.
    const org = (await client.query(
      `insert into app.organizations (slug, name) values ($1, $2)
       on conflict (slug) do update set name = excluded.name, updated_at = now()
       returning id, slug, name`,
      [ORG_SLUG, ORG_NAME]
    )).rows[0];

    // 2. Profile + credentials for the admin.
    let profileId = (await client.query(
      `select user_profile_id from app.user_credentials where email_normalized = $1`,
      [EMAIL]
    )).rows[0]?.user_profile_id || null;

    let created = false;
    if (!profileId) {
      created = true;
      const authUserId = `teler:${crypto.randomUUID()}`;
      profileId = (await client.query(
        `insert into app.user_profiles (auth_user_id, display_name) values ($1, $2) returning id`,
        [authUserId, NAME]
      )).rows[0].id;
      await client.query(
        `insert into app.user_credentials (user_profile_id, email_normalized, password_hash)
         values ($1, $2, $3)`,
        [profileId, EMAIL, await hashPassword(PASSWORD)]
      );
    } else if (RESET_PASSWORD) {
      await client.query(
        `update app.user_credentials set password_hash = $2 where user_profile_id = $1`,
        [profileId, await hashPassword(PASSWORD)]
      );
    }

    // 3. Owner membership in the shared org.
    await client.query(
      `insert into app.organization_memberships (organization_id, user_profile_id, role, status)
       values ($1, $2, 'owner', 'active')
       on conflict (organization_id, user_profile_id)
         do update set role = 'owner', status = 'active'`,
      [org.id, profileId]
    );

    // 4. Employee record (external_key must equal the profile id).
    await client.query(
      `insert into app.employees (organization_id, external_key, display_name, email_normalized, job_role)
       values ($1, $2, $3, $4, 'manager')
       on conflict (organization_id, external_key) do nothing`,
      [org.id, profileId, NAME, EMAIL]
    );

    await client.query('commit');
    console.log(`[ensure-admin] Organization ${org.slug} (${org.id}) ready.`);
    console.log(`[ensure-admin] Owner ${EMAIL} ${created ? 'created' : (RESET_PASSWORD ? 'password reset' : 'confirmed')}.`);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('[ensure-admin] failed:', error.message);
  process.exitCode = 1;
});
