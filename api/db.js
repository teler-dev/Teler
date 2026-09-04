'use strict';

const { Pool } = require('pg');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
let pool = null;

function getPool() {
  if (!DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 6, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 8_000 });
    pool.on('error', error => console.error('[database/pool]', error.message));
  }
  return pool;
}

async function withTransaction(callback) {
  const activePool = getPool();
  if (!activePool) throw new Error('DATABASE_URL is not configured');
  const client = await activePool.connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getPool, withTransaction };