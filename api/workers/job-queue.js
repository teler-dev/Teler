'use strict';

const { getPool } = require('../db');

async function claimNextJob() {
  const pool = getPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const picked = await client.query(`
      select id, job_type, payload, attempts, max_attempts
      from app.background_jobs
      where status in ('pending','retrying') and run_after <= now()
      order by priority desc, run_after asc, created_at asc
      for update skip locked
      limit 1
    `);
    if (!picked.rowCount) {
      await client.query('commit');
      return null;
    }
    const job = picked.rows[0];
    await client.query(`
      update app.background_jobs
      set status='running', attempts=attempts+1, started_at=now(), error_message=null
      where id=$1
    `, [job.id]);
    await client.query('commit');
    return { ...job, attempts: job.attempts + 1 };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function completeJob(id, result = {}) {
  const pool = getPool();
  await pool.query(`update app.background_jobs set status='completed', completed_at=now(), result=$2, error_message=null where id=$1`, [id, result]);
}

async function failOrRetry(job, error) {
  const pool = getPool();
  const message = String(error?.message || error || 'Unknown worker error').slice(0, 2000);
  if (job.attempts < job.max_attempts) {
    const delaySeconds = Math.min(300, 15 * Math.pow(2, Math.max(0, job.attempts - 1)));
    await pool.query(`update app.background_jobs set status='retrying', run_after=now()+($2 || ' seconds')::interval, error_message=$3 where id=$1`, [job.id, String(delaySeconds), message]);
  } else {
    await pool.query(`update app.background_jobs set status='failed', completed_at=now(), error_message=$2 where id=$1`, [job.id, message]);
  }
}

module.exports = { claimNextJob, completeJob, failOrRetry };