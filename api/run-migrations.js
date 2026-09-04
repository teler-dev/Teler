'use strict';

const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

async function main() {
  const pool = getPool();
  if (!pool) {
    console.log('[migration] DATABASE_URL not configured; skipping database evolution migration');
    return;
  }
  const prereq = await pool.query("select to_regclass('app.organizations') as organizations");
  if (!prereq.rows[0]?.organizations) {
    console.log('[migration] app.organizations is missing; apply database/001_initial_multitenant.sql first');
    return;
  }
  const migration = path.resolve(__dirname, '..', 'database', '004_backend_evolution.sql');
  const sql = fs.readFileSync(migration, 'utf8');
  await pool.query(sql);
  console.log('[migration] 004_backend_evolution.sql applied successfully');
  await pool.end();
}

main().catch(error => {
  console.error('[migration] failed:', error.message);
  process.exitCode = 1;
});