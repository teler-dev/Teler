#!/usr/bin/env node
/**
 * TELER sync agent — pushes tracker output from this machine to the API server.
 *
 * The server exposes POST /api/sync/file, which writes a raw body to
 * DATA_ROOT/<X-Sync-Path>. This walks the local data root and uploads
 * anything the server does not already have.
 *
 * A local manifest (.teler-sync-manifest.json, stored beside this script)
 * records size+mtime per uploaded file, so re-runs only send what changed.
 * Without it, every run would re-upload the full ~272 MB.
 *
 * Usage:
 *   node sync-agent.js --once     # seed / one-shot catch-up, then exit
 *   node sync-agent.js --watch    # seed, then rescan on an interval forever
 *   node sync-agent.js --once --dry-run
 *
 * Env:
 *   TELER_API_BASE    https://130-61-12-34.sslip.io      (required)
 *   TELER_SYNC_TOKEN  shared secret; matches SYNC_TOKEN (or API_TOKEN) server-side
 *   TELER_DATA_ROOT   local data dir (default: the AI-Timer data folder)
 *   TELER_SYNC_INTERVAL  seconds between rescans in --watch mode (default 60)
 */

const fs   = require('fs');
const fsp  = require('fs/promises');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────────────

const API_BASE = (process.env.TELER_API_BASE || '').trim().replace(/\/+$/, '');
const TOKEN    = (process.env.TELER_SYNC_TOKEN || '').trim();
const DATA_ROOT = process.env.TELER_DATA_ROOT ||
  'C:\\Users\\essaz\\OneDrive\\Documents\\AI-Timer\\data';
const INTERVAL_MS = (Number(process.env.TELER_SYNC_INTERVAL) || 60) * 1000;

const MANIFEST = path.join(__dirname, '.teler-sync-manifest.json');

const MODE    = process.argv.includes('--watch') ? 'watch' : 'once';
const DRY_RUN = process.argv.includes('--dry-run');

// Upload these; everything else in the data root is local noise.
const SYNC_DIRS = ['logs', 'ai_reports', 'screenshots', 'keystroke', 'ocr', 'companies', 'summary'];
const SYNC_EXTS = new Set(['.json', '.jsonl', '.txt', '.png', '.jpg', '.jpeg']);

// Server accepts up to 100 MB; refuse earlier so we fail loudly, not with a 413.
const MAX_BYTES = 95 * 1024 * 1024;
const CONCURRENCY = 4;

// ── Manifest ───────────────────────────────────────────────────────────────────

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch { return {}; }
}

function saveManifest(m) {
  const tmp = MANIFEST + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m));
  fs.renameSync(tmp, MANIFEST);
}

/** Fingerprint used to decide "already uploaded and unchanged". */
function fingerprint(stat) {
  return `${stat.size}:${Math.floor(stat.mtimeMs)}`;
}

// ── Walk ───────────────────────────────────────────────────────────────────────

/** Recursively collect syncable files, yielding paths relative to DATA_ROOT. */
async function walk(absDir, relBase, out) {
  let entries;
  try { entries = await fsp.readdir(absDir, { withFileTypes: true }); }
  catch { return out; }   // folder vanished mid-scan, or unreadable

  for (const entry of entries) {
    const abs = path.join(absDir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walk(abs, rel, out);
    } else if (entry.isFile() && SYNC_EXTS.has(path.extname(entry.name).toLowerCase())) {
      out.push({ abs, rel });
    }
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

// ── Upload ─────────────────────────────────────────────────────────────────────

async function uploadFile(file) {
  const body = await fsp.readFile(file.abs);

  const headers = {
    'Content-Type': 'application/octet-stream',
    'X-Sync-Path': file.rel,          // always forward slashes; server splits on '/'
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const res = await fetch(`${API_BASE}/api/sync/file`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    // 4xx means the request itself is wrong (bad token, bad path) — retrying
    // it 343 times just burns minutes. 429 is the exception: that one backs off.
    err.permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  return json.status || 'ok';
}

/** Upload with a couple of retries — the tracker machine's uplink is not reliable. */
async function uploadWithRetry(file, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await uploadFile(file); }
    catch (err) {
      lastErr = err;
      if (err.permanent) throw err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

// ── Sync pass ──────────────────────────────────────────────────────────────────

async function syncOnce() {
  const manifest = loadManifest();
  const files = await collectFiles();

  // Filter to files that are new or changed since the last successful upload.
  const pending = [];
  let skippedTooBig = 0;
  for (const file of files) {
    let stat;
    try { stat = await fsp.stat(file.abs); } catch { continue; }
    if (stat.size > MAX_BYTES) { skippedTooBig++; continue; }
    const fp = fingerprint(stat);
    if (manifest[file.rel] === fp) continue;
    pending.push({ ...file, fp, size: stat.size });
  }

  const totalBytes = pending.reduce((n, f) => n + f.size, 0);
  console.log(
    `[teler-sync] ${files.length} local files, ${pending.length} to upload ` +
    `(${(totalBytes / 1024 / 1024).toFixed(1)} MB)` +
    (skippedTooBig ? `, ${skippedTooBig} skipped as oversized` : '')
  );

  if (DRY_RUN) {
    for (const f of pending.slice(0, 20)) console.log('  would upload:', f.rel);
    if (pending.length > 20) console.log(`  ... and ${pending.length - 20} more`);
    return { uploaded: 0, failed: 0 };
  }

  let uploaded = 0, failed = 0, done = 0;
  let authFailure = null;   // set on 401/403 — every other file would fail identically

  // Fixed-size worker pool over the pending queue.
  const queue = pending.slice();
  async function worker() {
    for (;;) {
      if (authFailure) return;
      const file = queue.shift();
      if (!file) return;
      try {
        await uploadWithRetry(file);
        manifest[file.rel] = file.fp;
        uploaded++;
      } catch (err) {
        failed++;
        if (/HTTP 40[13]/.test(err.message)) {
          authFailure = err;
          return;
        }
        console.error(`  ! ${file.rel}: ${err.message}`);
      }
      done++;
      if (done % 100 === 0) {
        console.log(`  ...${done}/${pending.length}`);
        saveManifest(manifest);   // checkpoint, so a crash doesn't lose progress
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  saveManifest(manifest);

  if (authFailure) {
    console.error(`[teler-sync] aborted — server rejected the token (${authFailure.message}).`);
    console.error('  Check TELER_SYNC_TOKEN matches SYNC_TOKEN/API_TOKEN in /etc/teler/teler.env');
    if (MODE === 'once') process.exitCode = 1;
    return { uploaded, failed, authFailure: true };
  }

  console.log(`[teler-sync] uploaded ${uploaded}, failed ${failed}`);
  return { uploaded, failed };
}

// ── Entry ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_BASE) {
    console.error('TELER_API_BASE is not set. Example:\n' +
      '  set TELER_API_BASE=https://130-61-12-34.sslip.io');
    process.exit(1);
  }
  if (!fs.existsSync(DATA_ROOT)) {
    console.error(`Data root not found: ${DATA_ROOT}`);
    process.exit(1);
  }

  console.log(`[teler-sync] mode=${MODE} root=${DATA_ROOT} -> ${API_BASE}`);
  if (!TOKEN) console.warn('[teler-sync] WARNING: TELER_SYNC_TOKEN is empty');

  await syncOnce();

  if (MODE === 'watch') {
    console.log(`[teler-sync] watching; rescanning every ${INTERVAL_MS / 1000}s`);
    for (;;) {
      await new Promise(r => setTimeout(r, INTERVAL_MS));
      try { await syncOnce(); }
      catch (err) { console.error('[teler-sync] pass failed:', err.message); }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
