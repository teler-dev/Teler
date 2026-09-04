'use strict';

const { getPool } = require('./db');
const { claimNextJob, completeJob, failOrRetry } = require('./workers/job-queue');
const { processSessionNormalization } = require('./workers/session-normalizer');
const { processReportGeneration } = require('./workers/report-generator');
const { processRetentionCleanup } = require('./workers/retention-cleanup');

const POLL_MS = Math.max(500, Number(process.env.WORKER_POLL_MS) || 1500);
const handlers = {
  SessionNormalization: processSessionNormalization,
  ReportGeneration: processReportGeneration,
  DataRetentionCleanup: processRetentionCleanup,
};
let stopping = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!getPool()) {
    console.log('[worker] DATABASE_URL not configured; worker will idle without consuming jobs');
    while (!stopping) await sleep(30_000);
    return;
  }
  console.log(`[worker] TELER background worker started; poll=${POLL_MS}ms`);
  while (!stopping) {
    let job;
    try {
      job = await claimNextJob();
      if (!job) { await sleep(POLL_MS); continue; }
      const handler = handlers[job.job_type];
      if (!handler) throw new Error(`Unsupported job type: ${job.job_type}`);
      const result = await handler(job.payload || {});
      await completeJob(job.id, result);
      console.log(`[worker] completed ${job.job_type} ${job.id}`);
    } catch (error) {
      console.error('[worker]', error.message);
      if (job) await failOrRetry(job, error).catch(queueError => console.error('[worker/queue]', queueError.message));
      else await sleep(POLL_MS);
    }
  }
}

process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
main().catch(error => { console.error('[worker/fatal]', error); process.exit(1); });