'use strict';

const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

const MIGRATIONS = [
  '004_backend_evolution.sql',
  '005_backend_integrity.sql',
];

async function main() {
  const pool = getPool();
  if (!pool) {
    console.log('[migration] DATABASE_URL not configured; skipping database evolution migrations');
    return;
  }
  const prereq = await pool.query("select to_regclass('app.organizations') as organizations");
  if (!prereq.rows[0]?.organizations) {
    console.log('[migration] app.organizations is missing; apply database/001_initial_multitenant.sql first');
    await pool.end();
    return;
  }

  for (const filename of MIGRATIONS) {
    const migration = path.resolve(__dirname, '..', 'database', filename);
    const sql = fs.readFileSync(migration, 'utf8');
    await pool.query(sql);
    console.log(`[migration] ${filename} applied successfully`);
  }
  await pool.end();
}

main().catch(error => {
  console.error('[migration] failed:', error.message);
  process.exitCode = 1;
});