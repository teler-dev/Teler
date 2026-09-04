#!/usr/bin/env node
'use strict';

/**
 * TELER sync agent.
 *
 * 1) Keeps the existing raw-file mirror to /api/sync/file for rollback/evidence.
 * 2) Shadow-ingests completed sessions through /api/v1/ingest/session so the
 *    Oracle worker can normalize telemetry into PostgreSQL.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const API_BASE = (process.env.TELER_API_BASE || '').trim().replace(/\/+$/, '');
const TOKEN = (process.env.TELER_SYNC_TOKEN || '').trim();
const DATA_ROOT = process.env.TELER_DATA_ROOT || 'C:\\Users\\essaz\\OneDrive\\Documents\\AI-Timer\\data';
const INTERVAL_MS = (Number(process.env.TELER_SYNC_INTERVAL) || 60) * 1000;
const MANIFEST = path.join(__dirname, '.teler-sync-manifest.json');
const MODE = process.argv.includes('--watch') ? 'watch' : 'once';
const DRY_RUN = process.argv.includes('--dry-run');
const SYNC_DIRS = ['logs', 'ai_reports', 'screenshots', 'keystroke', 'ocr', 'companies', 'summary'];
const SYNC_EXTS = new Set(['.json', '.jsonl', '.txt', '.png', '.jpg', '.jpeg']);
const MAX_BYTES = 95 * 1024 * 1024;
const CONCURRENCY = 4;
const ROLE_TO_EMP = { developer: 'EMP_DEV', designer: 'EMP_DES', manager: 'EMP_MGR', accountant: 'EMP_ACC', qa: 'EMP_QA', general: 'EMP_GEN' };

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch { return {}; }
}

function saveManifest(manifest) {
  const tmp = `${MANIFEST}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest));
  fs.renameSync(tmp, MANIFEST);
}

function fingerprint(stat) {
  return `${stat.size}:${Math.floor(stat.mtimeMs)}`;
}

async function walk(absDir, relBase, out) {
  let entries;
  try { entries = await fsp.readdir(absDir, { withFileTypes: true }); }
  catch { return out; }
  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(abs, rel, out);
    else if (entry.isFile() && SYNC_EXTS.has(path.extname(entry.name).toLowerCase())) out.push({ abs, rel });
  }
  return out;
}

async function collectFiles() {
  const files = [];
  for (const dir of SYNC_DIRS) {
    const abs = path.join(DATA_ROOT, dir);
    if (fs.existsSync(abs)) await walk(abs, dir, files);
  }
  return files;
}

function authHeaders(extra = {}) {
  return TOKEN ? { ...extra, Authorization: `Bearer ${TOKEN}` } : extra;
}

async function uploadFile(file) {
  const body = await fsp.readFile(file.abs);
  const res = await fetch(`${API_BASE}/api/sync/file`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/octet-stream', 'X-Sync-Path': file.rel }),
    body,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    error.permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw error;
  }
  return res.json().catch(() => ({}));
}

async function uploadWithRetry(file, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await uploadFile(file); }
    catch (error) {
      lastError = error;
      if (error.permanent) throw error;
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

function parseJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch { return null; }
}

function parseEvents(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line.replace(/^\uFEFF/, '')); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function localTimestamp(date, time) {
  if (!date || !time) return null;
  const value = new Date(`${date}T${String(time).replace(/-/g, ':')}`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function resolveLegacyEmployee(master) {
  const role = String(master?.summary?.role || 'general').toLowerCase();
  return master?.meta?.employee_id || ROLE_TO_EMP[role] || 'EMP_UNKNOWN';
}

function serverStoragePath(localPath) {
  if (!localPath) return null;
  const root = path.resolve(DATA_ROOT);
  const resolved = path.resolve(String(localPath));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return path.relative(root, resolved).split(path.sep).join('/');
}

function screenshotMetadata(master) {
  return (Array.isArray(master?.snapshots) ? master.snapshots : [])
    .filter(snapshot => snapshot && snapshot.screenshot_type !== 'duplicate' && snapshot.screenshot_path)
    .map(snapshot => ({
      storage_path: serverStoragePath(snapshot.screenshot_path),
      active_window: snapshot.active_window || null,
      active_app: snapshot.process_name || null,
      timestamp: snapshot.timestamp || null,
    }))
    .filter(snapshot => snapshot.storage_path);
}

function structuredCandidates(files) {
  const byRel = new Map(files.map(file => [file.rel, file]));
  const candidates = [];
  for (const file of files) {
    let match = file.rel.match(/^companies\/([^/]+)\/employees\/([^/]+)\/sessions\/(\d{4}-\d{2}-\d{2})\/Session_([^/]+)\/master\.json$/);
    if (match) {
      const [, organization, employee, date, stamp] = match;
      candidates.push({ file, organization, employee, date, stamp, events: byRel.get(file.rel.replace(/master\.json$/, 'events.jsonl')) });
      continue;
    }
    match = file.rel.match(/^logs\/(\d{4}-\d{2}-\d{2})\/Session_([^/]+)\/master\.json$/);
    if (match) {
      const [, date, stamp] = match;
      candidates.push({ file, organization: null, employee: null, date, stamp, events: byRel.get(file.rel.replace(/master\.json$/, 'events.jsonl')) });
      continue;
    }
    match = file.rel.match(/^logs\/(\d{4}-\d{2}-\d{2})\/([^/]+)-master\.json$/);
    if (match) {
      const [, date, stamp] = match;
      candidates.push({ file, organization: null, employee: null, date, stamp, events: byRel.get(`logs/${date}/${stamp}-events.jsonl`) });
    }
  }
  return candidates;
}

async function structuredFingerprint(candidate) {
  const masterStat = await fsp.stat(candidate.file.abs);
  const eventStat = candidate.events ? await fsp.stat(candidate.events.abs).catch(() => null) : null;
  return `${fingerprint(masterStat)}:${eventStat ? fingerprint(eventStat) : 'no-events'}`;
}

async function ingestStructured(candidate, sourceFingerprint) {
  const master = parseJson(candidate.file.abs);
  if (!master || !['completed', 'recovered'].includes(master.status)) return { skipped: true };
  const summary = master.summary || {};
  const meta = master.meta || {};
  const startedAt = localTimestamp(candidate.date, summary.session_start || candidate.stamp);
  let endedAt = localTimestamp(candidate.date, summary.session_end || candidate.stamp);
  if (startedAt && endedAt && new Date(endedAt) < new Date(startedAt)) {
    endedAt = new Date(new Date(endedAt).getTime() + 86_400_000).toISOString();
  }
  const employee = candidate.employee || resolveLegacyEmployee(master);
  const organization = candidate.organization || meta.company_id || 'COMP_DEV_001';
  const payload = {
    organization_external_key: organization,
    employee_external_key: employee,
    employee_name: meta.user_name || employee,
    device_name: os.hostname(),
    external_session_id: `${candidate.date}_${candidate.stamp}`,
    started_at: startedAt,
    ended_at: endedAt,
    total_duration_seconds: Number(summary.duration_seconds) || undefined,
    role: summary.role || 'general',
    task: summary.task || '',
    summary,
    events: candidate.events ? parseEvents(candidate.events.abs) : [],
    screenshots: screenshotMetadata(master),
    source_version: 'sync-agent-v1',
    source_fingerprint: crypto.createHash('sha256').update(sourceFingerprint).digest('hex'),
  };
  if (!payload.started_at) return { skipped: true };

  const res = await fetch(`${API_BASE}/api/v1/ingest/session`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(`structured HTTP ${res.status} ${text.slice(0, 200)}`);
    error.unavailable = [404, 503].includes(res.status);
    throw error;
  }
  return res.json().catch(() => ({}));
}

async function shadowIngest(files, manifest) {
  let ingested = 0;
  let skipped = 0;
  let unavailable = false;
  for (const candidate of structuredCandidates(files)) {
    const fp = await structuredFingerprint(candidate).catch(() => null);
    if (!fp) continue;
    const key = `@structured/${candidate.file.rel}`;
    if (manifest[key] === fp) { skipped += 1; continue; }
    if (DRY_RUN) { console.log('  would normalize:', candidate.file.rel); continue; }
    try {
      const result = await ingestStructured(candidate, fp);
      if (result.skipped) { skipped += 1; continue; }
      manifest[key] = fp;
      ingested += 1;
    } catch (error) {
      if (error.unavailable) {
        unavailable = true;
        console.warn(`[teler-sync] structured ingestion unavailable; raw sync remains authoritative (${error.message})`);
        break;
      }
      console.error(`  ! structured ${candidate.file.rel}: ${error.message}`);
    }
  }
  return { ingested, skipped, unavailable };
}

async function syncOnce() {
  const manifest = loadManifest();
  const files = await collectFiles();
  const pending = [];
  let skippedTooBig = 0;
  for (const file of files) {
    let stat;
    try { stat = await fsp.stat(file.abs); } catch { continue; }
    if (stat.size > MAX_BYTES) { skippedTooBig += 1; continue; }
    const fp = fingerprint(stat);
    if (manifest[file.rel] === fp) continue;
    pending.push({ ...file, fp, size: stat.size });
  }

  const totalBytes = pending.reduce((sum, file) => sum + file.size, 0);
  console.log(`[teler-sync] ${files.length} local files, ${pending.length} raw uploads (${(totalBytes / 1024 / 1024).toFixed(1)} MB)${skippedTooBig ? `, ${skippedTooBig} oversized` : ''}`);
  if (DRY_RUN) {
    pending.slice(0, 20).forEach(file => console.log('  would upload:', file.rel));
    await shadowIngest(files, manifest);
    return { uploaded: 0, failed: 0, structured: 0 };
  }

  let uploaded = 0;
  let failed = 0;
  let authFailure = null;
  const queue = pending.slice();
  async function worker() {
    for (;;) {
      if (authFailure) return;
      const file = queue.shift();
      if (!file) return;
      try {
        await uploadWithRetry(file);
        manifest[file.rel] = file.fp;
        uploaded += 1;
      } catch (error) {
        failed += 1;
        if (/HTTP 40[13]/.test(error.message)) { authFailure = error; return; }
        console.error(`  ! ${file.rel}: ${error.message}`);
      }
      if ((uploaded + failed) % 100 === 0) saveManifest(manifest);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveManifest(manifest);

  if (authFailure) {
    console.error(`[teler-sync] aborted: server rejected TELER_SYNC_TOKEN (${authFailure.message})`);
    if (MODE === 'once') process.exitCode = 1;
    return { uploaded, failed, structured: 0 };
  }

  const structured = await shadowIngest(files, manifest);
  saveManifest(manifest);
  console.log(`[teler-sync] raw uploaded=${uploaded}, failed=${failed}; structured queued=${structured.ingested}`);
  return { uploaded, failed, structured: structured.ingested };
}

async function main() {
  if (!API_BASE) throw new Error('TELER_API_BASE is not set');
  if (!fs.existsSync(DATA_ROOT)) throw new Error(`Data root not found: ${DATA_ROOT}`);
  console.log(`[teler-sync] mode=${MODE} root=${DATA_ROOT} -> ${API_BASE}`);
  if (!TOKEN) console.warn('[teler-sync] WARNING: TELER_SYNC_TOKEN is empty');
  await syncOnce();
  if (MODE === 'watch') {
    console.log(`[teler-sync] watching; rescanning every ${INTERVAL_MS / 1000}s`);
    while (true) {
      await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
      try { await syncOnce(); }
      catch (error) { console.error('[teler-sync] pass failed:', error.message); }
    }
  }
}

main().catch(error => { console.error('[teler-sync]', error.message); process.exit(1); });