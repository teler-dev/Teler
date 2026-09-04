'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { validate } = require('../modules/ingestion');
const { normalizeTelemetry } = require('../lib/telemetry-normalizer');
const { conditionMatches } = require('../workers/session-normalizer');
const { processReportGeneration } = require('../workers/report-generator');
const { processRetentionCleanup, safeDelete } = require('../workers/retention-cleanup');

test('structured ingestion validation rejects missing identity', () => {
  const errors = validate({ external_session_id: 's1', started_at: '2026-09-04T10:00:00Z', events: [] });
  assert.ok(errors.some(error => error.includes('organization')));
  assert.ok(errors.some(error => error.includes('employee')));
});

test('telemetry normalizer builds deterministic minute metrics and app switches', () => {
  const normalized = normalizeTelemetry({
    summary: { key_count: 12, mouse_clicks: 3 },
    events: [
      { timestamp: '2026-09-04T10:00:00Z', window_title: 'Visual Studio Code', keys: 0, clicks: 0, idle_seconds: 0 },
      { timestamp: '2026-09-04T10:00:30Z', window_title: 'Visual Studio Code', keys: 5, clicks: 1, idle_seconds: 0 },
      { timestamp: '2026-09-04T10:01:00Z', window_title: 'Chrome', keys: 8, clicks: 2, idle_seconds: 0 },
      { timestamp: '2026-09-04T10:01:30Z', window_title: 'Chrome', keys: 12, clicks: 3, idle_seconds: 0 },
    ],
  });
  assert.equal(normalized.metrics.keyCount, 12);
  assert.equal(normalized.metrics.clickCount, 3);
  assert.equal(normalized.metrics.appSwitches, 1);
  assert.equal(normalized.segments.length, 2);
  assert.ok(normalized.minuteMetrics.length >= 2);
});

test('custom alert conditions support bounded numeric operators', () => {
  assert.equal(conditionMatches(35, '>', 30), true);
  assert.equal(conditionMatches(35, '<=', 30), false);
  assert.equal(conditionMatches(30, '==', '30'), true);
  assert.equal(conditionMatches(undefined, '>', 1), false);
});

test('report and retention worker handlers load and retention path guard rejects outside data root', () => {
  assert.equal(typeof processReportGeneration, 'function');
  assert.equal(typeof processRetentionCleanup, 'function');
  assert.equal(safeDelete(path.resolve(os.tmpdir(), 'definitely-outside-teler-root')), false);
});

async function waitFor(url, attempts = 40) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`Server did not become ready: ${url}`);
}

test('server entry preserves legacy health and isolates v1 sync/read tokens', { timeout: 15_000 }, async t => {
  const port = 17000 + Math.floor(Math.random() * 1000);
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'teler-backend-test-'));
  const child = spawn(process.execPath, ['server-entry.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_ROOT: dataRoot, DATABASE_URL: '', API_TOKEN: 'api-test-token', SYNC_TOKEN: 'sync-test-token', ALLOWED_ORIGINS: '*' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  t.after(() => {
    if (!child.killed) child.kill('SIGTERM');
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  const health = await waitFor(`http://127.0.0.1:${port}/health`);
  const legacy = await health.json();
  assert.equal(legacy.status, 'ok');
  assert.equal(legacy.auth, true);
  assert.equal(typeof legacy.sessions, 'number');

  const v1Health = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
  assert.equal(v1Health.status, 200);
  assert.equal((await v1Health.json()).architecture, 'modular-monolith-v1');

  const noReadToken = await fetch(`http://127.0.0.1:${port}/api/v1/companies`);
  assert.equal(noReadToken.status, 401);

  const wrongIngestToken = await fetch(`http://127.0.0.1:${port}/api/v1/ingest/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer api-test-token' },
    body: JSON.stringify({ organization_external_key: 'COMP_DEV_001', employee_external_key: 'EMP_DEV', external_session_id: 'smoke', started_at: '2026-09-04T10:00:00Z', events: [] }),
  });
  assert.equal(wrongIngestToken.status, 401);

  const syncTokenAccepted = await fetch(`http://127.0.0.1:${port}/api/v1/ingest/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sync-test-token' },
    body: JSON.stringify({ organization_external_key: 'COMP_DEV_001', employee_external_key: 'EMP_DEV', external_session_id: 'smoke', started_at: '2026-09-04T10:00:00Z', events: [] }),
  });
  assert.equal(syncTokenAccepted.status, 500, stderr);
});