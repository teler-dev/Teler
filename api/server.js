/**
 * TELER Local API Server  –  port 7001
 *
 * Data root: C:\Users\essaz\OneDrive\Documents\AI-Timer\data
 *
 * Supports two folder layouts that co-exist across dates:
 *
 *  NEW format (2026-01-08+):
 *    logs/<date>/Session_<stamp>/master.json
 *    logs/<date>/Session_<stamp>/events.jsonl
 *    ai_reports/<date>/Session_<stamp>/image_based/<stamp>_*_IMG.json
 *    ai_reports/<date>/Session_<stamp>/ocr_based/<stamp>_*_OCR.json
 *    ai_reports/<date>/Session_<stamp>/AI-Final/*.txt
 *    screenshots/<date>/Session_<stamp>/<date>_<HH-MM-SS>.png
 *
 *  OLD format (pre-2026-01-08):
 *    logs/<date>/<stamp>-master.json
 *    logs/<date>/<stamp>-events.jsonl
 *    ai_reports/<date>/<stamp>-ai-<model>.json
 *    ai_reports/<date>/<stamp>-ai-<model>.txt
 *    screenshots/<date>/<date>_<HH-MM-SS>.png
 *
 *  Keystroke (all dates):  keystroke/<date>/<stamp>-keystroke-hour*.json
 *  OCR (new dates):        ocr/<date>/<stamp>-ocr-hour*.jsonl
 *
 * AI report scores are 0-10 scale → multiplied ×10 for 0-100 dashboard.
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const crypto  = require('crypto');

const { classifyWindow } = require('./classifier');

const app  = express();
// ── Configuration (env-driven; defaults keep local Windows dev working) ────────
const PORT = Number(process.env.PORT) || 7001;

// Data root. On the Ubuntu server this is set via the systemd EnvironmentFile.
const BASE = process.env.DATA_ROOT ||
  (process.platform === 'win32'
    ? 'C:\\Users\\essaz\\OneDrive\\Documents\\AI-Timer\\data'
    : '/opt/teler/data');

// Shared secret. Reads and syncs both require it when set. Leaving it empty
// disables auth entirely — fine on localhost, never in production.
const API_TOKEN  = (process.env.API_TOKEN  || '').trim();
// Separate secret for the write endpoint; falls back to API_TOKEN if unset.
const SYNC_TOKEN = (process.env.SYNC_TOKEN || '').trim() || API_TOKEN;

// Comma-separated browser origins allowed to call the API (the Vercel domain).
// '*' keeps the old wide-open behavior for local development.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map(o => o.trim()).filter(Boolean);

const MACHINE_USER = os.userInfo().username;  // fallback for sessions without meta.user_name

const COMPANY_ID = 'COMP_DEV_001';
const ROLE_TO_EMP = {
  developer: 'EMP_DEV',
  designer:  'EMP_DES',
  manager:   'EMP_MGR',
  qa:        'EMP_QA',
  general:   'EMP_GEN',
};
function resolveEmployeeId(role) {
  return ROLE_TO_EMP[(role || '').toLowerCase()] || 'EMP_UNKNOWN';
}

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
  // Authorization has to survive preflight for the bearer token to work.
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Sync-Path'],
}));
app.use(express.json());

// ── Auth ───────────────────────────────────────────────────────────────────────

function presentedToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  // <img src> cannot set headers, so /screenshots also accepts ?token=
  if (typeof req.query.token === 'string') return req.query.token.trim();
  return '';
}

// Constant-time compare so a wrong token can't be recovered by timing responses.
function tokenMatches(presented, expected) {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireToken(expected) {
  return (req, res, next) => {
    if (!expected) return next();            // auth disabled (local dev)
    if (tokenMatches(presentedToken(req), expected)) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  };
}

const requireApiToken  = requireToken(API_TOKEN);
const requireSyncToken = requireToken(SYNC_TOKEN);

// /health stays open so uptime checks and the deploy script can probe it.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (req.path === '/api/sync/file') return requireSyncToken(req, res, next);
  return requireApiToken(req, res, next);
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeParse(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch { return null; }
}

function safeRead(filePath) {
  try { return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''); }
  catch { return ''; }
}

function listDir(folder) {
  try { return fs.readdirSync(folder); }
  catch { return []; }
}

function listDates(subFolder) {
  const dir = path.join(BASE, subFolder);
  return listDir(dir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

function exists(p) {
  try { return fs.existsSync(p); }
  catch { return false; }
}

// Atomic file write: write to .tmp then rename — prevents corrupt partial writes.
// On Windows, fs.renameSync is not atomic across different drives but is atomic
// within the same volume, which is the normal case here.
function atomicWriteFile(dest, data) {
  const tmp = dest + '.tmp';
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

// ── Parse AI report JSON (scores 0-10 → ×10) ─────────────────────────────────

function pickAiReportJson(date, stamp) {
  // Try new format: ai_reports/<date>/Session_<stamp>/image_based/*.json
  const imgDir = path.join(BASE, 'ai_reports', date, `Session_${stamp}`, 'image_based');
  const ocrDir = path.join(BASE, 'ai_reports', date, `Session_${stamp}`, 'ocr_based');

  for (const dir of [imgDir, ocrDir]) {
    const files = listDir(dir).filter(f => f.endsWith('.json'));
    // Bug fix: iterate ALL files, not just files[0] — first file may be empty {}
    for (const file of files) {
      const data = safeParse(path.join(dir, file));
      if (data && typeof data.overall_productivity_score !== 'undefined') {
        return { data, source: dir === imgDir ? 'IMG' : 'OCR', file };
      }
    }
  }

  // Try old format: ai_reports/<date>/<stamp>-ai-<model>.json (flat in date dir)
  const oldDir = path.join(BASE, 'ai_reports', date);
  const oldFiles = listDir(oldDir).filter(f => f.startsWith(stamp) && f.endsWith('.json'));
  for (const file of oldFiles) {
    const data = safeParse(path.join(oldDir, file));
    if (data && typeof data.overall_productivity_score !== 'undefined') {
      return { data, source: 'OCR', file };
    }
  }

  return { data: null, source: 'OCR', file: null };
}

// Proper-case display names and short codes for each model raw key.
const MODEL_META = {
  grok:     { key: 'Grok',     short: 'GK'   },
  gemini:   { key: 'Gemini',   short: 'GINI' },
  nvidia:   { key: 'Nvidia',   short: 'NDA'  },
  deepseek: { key: 'DeepSeek', short: 'DS'   },
  gemma:    { key: 'Gemma',    short: 'GM'   },
  local:    { key: 'Local',    short: 'N/A'  },
};

// Extract a clean model key from an AI report filename.
// Handles both abbrev style (_GK_, _GINI_, _NDA_) and long style (-ai-gemini_vision).
function modelFromFilename(filename) {
  const n = (filename || '').toLowerCase().replace(/\.json$/, '');
  if (n.includes('_gk_'))       return 'grok';
  if (n.includes('_gini_'))     return 'gemini';
  if (n.includes('_nda_'))      return 'nvidia';
  // Long-form: <stamp>-ai-<model>  (e.g. 22-51-01-ai-gemini_vision)
  const m = n.match(/-ai-(.+)$/);
  if (m) {
    const raw = m[1];
    if (raw.includes('gemini'))  return 'gemini';
    if (raw.includes('grok'))    return 'grok';
    if (raw.includes('nvidia'))  return 'nvidia';
    if (raw.includes('deepseek'))return 'deepseek';
    if (raw.includes('gemma'))   return 'gemma';
    return raw;
  }
  return 'local';
}

// Collect ALL models that have valid AI report data for a session.
// Returns an array like [{ key: 'Grok', short: 'GK' }, { key: 'Nvidia', short: 'NDA' }]
function collectAllModels(date, stamp) {
  const found = new Map(); // raw → meta

  function addFile(dir, file) {
    const data = safeParse(path.join(dir, file));
    if (data && typeof data.overall_productivity_score !== 'undefined') {
      const raw = modelFromFilename(file);
      if (!found.has(raw)) {
        found.set(raw, MODEL_META[raw] || {
          key:   raw.charAt(0).toUpperCase() + raw.slice(1),
          short: raw.toUpperCase().slice(0, 3),
        });
      }
    }
  }

  // New format: image_based + ocr_based
  for (const subDir of ['image_based', 'ocr_based']) {
    const dir = path.join(BASE, 'ai_reports', date, `Session_${stamp}`, subDir);
    listDir(dir).filter(f => f.endsWith('.json')).forEach(f => addFile(dir, f));
  }

  // Old format: flat ai_reports/<date>/<stamp>-ai-<model>.json
  const oldDir = path.join(BASE, 'ai_reports', date);
  listDir(oldDir)
    .filter(f => f.startsWith(stamp) && f.endsWith('.json'))
    .forEach(f => addFile(oldDir, f));

  return [...found.values()];
}

function pickAiReportModel(date, stamp) {
  // New format: find the file that actually has valid data (same file as pickAiReportJson found)
  for (const subDir of ['image_based', 'ocr_based']) {
    const dir = path.join(BASE, 'ai_reports', date, `Session_${stamp}`, subDir);
    for (const file of listDir(dir).filter(f => f.endsWith('.json'))) {
      const data = safeParse(path.join(dir, file));
      if (data && typeof data.overall_productivity_score !== 'undefined') {
        return modelFromFilename(file);
      }
    }
  }
  // Old format: flat ai_reports/<date>/<stamp>-ai-<model>.json
  const oldDir = path.join(BASE, 'ai_reports', date);
  const oldFiles = listDir(oldDir).filter(f => f.startsWith(stamp) && f.endsWith('.json'));
  for (const file of oldFiles) {
    const data = safeParse(path.join(oldDir, file));
    if (data && typeof data.overall_productivity_score !== 'undefined') {
      return modelFromFilename(file);
    }
  }
  return 'local';
}

function pickAiFinalText(date, stamp) {
  // New: ai_reports/<date>/Session_<stamp>/AI-Final/*.txt
  const finalDir = path.join(BASE, 'ai_reports', date, `Session_${stamp}`, 'AI-Final');
  const finalTxts = listDir(finalDir).filter(f => f.endsWith('.txt') && !f.endsWith('.raw.txt'));
  if (finalTxts.length > 0) return safeRead(path.join(finalDir, finalTxts[0]));

  // Also check image_based / ocr_based for inline .txt reports
  for (const sub of ['image_based', 'ocr_based']) {
    const dir = path.join(BASE, 'ai_reports', date, `Session_${stamp}`, sub);
    const txts = listDir(dir).filter(f => f.endsWith('.txt') && !f.endsWith('.raw.txt'));
    if (txts.length > 0) return safeRead(path.join(dir, txts[0]));
  }

  // Old: ai_reports/<date>/<stamp>-ai-<model>.txt
  const oldDir   = path.join(BASE, 'ai_reports', date);
  const oldFiles = listDir(oldDir).filter(f => f.startsWith(stamp) && f.endsWith('.txt') && !f.endsWith('.raw.txt'));
  if (oldFiles.length > 0) return safeRead(path.join(oldDir, oldFiles[0]));

  return '';
}

// Extract the SHORT EXECUTIVE SUMMARY section from AI-Final text.
// Falls back to first substantive paragraph if section header not found.
function extractExecSummary(aiFinalText, fallback) {
  if (!aiFinalText) return fallback;
  const lines = aiFinalText.split('\n');
  let inSection = false;
  const collected = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Detect "2." or "2. SHORT EXECUTIVE SUMMARY" header
    if (/^2\.?\s/i.test(trimmed)) { inSection = true; continue; }
    // Stop at section "3." or next numbered section
    if (inSection && /^3\.?\s/i.test(trimmed)) break;
    if (inSection && trimmed) collected.push(trimmed);
  }
  if (collected.length) return collected.join(' ').slice(0, 500);
  // Fallback: first line longer than 60 chars that isn't a header/score line
  const scored = /^(Focus|Workflow|Tool|Context|Overall|Session|Active|Distract)/i;
  const found = lines.find(l => {
    const t = l.trim();
    return t.length > 60 && !t.startsWith('---') && !t.startsWith('#') && !/^\d+\./.test(t) && !scored.test(t);
  });
  return found ? found.trim().slice(0, 500) : fallback;
}

// ── Build keystroke per-minute data ──────────────────────────────────────────

function buildKeystrokeData(date, stamp, sessionStart, sessionDir) {
  // New-format: sessionDir lives under companies/{co}/employees/{emp}/sessions/{date}/Session_{stamp}/
  // Employee root is 3 levels up: Session_{stamp} -> {date} -> sessions -> {emp}
  const candidateDirs = [];
  if (sessionDir && sessionDir.includes(path.sep + 'companies' + path.sep)) {
    candidateDirs.push(path.join(path.resolve(sessionDir, '..', '..', '..'), 'keystroke', date));
  }
  candidateDirs.push(path.join(BASE, 'keystroke', date));

  let dir, files;
  for (const d of candidateDirs) {
    const f = listDir(d).filter(f => f.startsWith(stamp) && f.endsWith('.json'));
    if (f.length) { dir = d; files = f; break; }
  }
  if (!files || !files.length) return { perMinute: [], peakWpm: 0, totalKeystrokes: 0 };

  const data = safeParse(path.join(dir, files[0]));
  if (!data) return { perMinute: [], peakWpm: 0, totalKeystrokes: 0 };

  const totalKeystrokes = data.total_keystrokes || 0;
  const keystrokes = data.detailed_keystrokes || [];

  // Group by minute relative to session start
  const minuteMap = {};
  const origin = sessionStart ? new Date(sessionStart) : null;

  for (const k of keystrokes) {
    const ts = new Date(k.timestamp);
    const minKey = origin
      ? Math.floor((ts - origin) / 60000)
      : parseInt(k.timestamp.slice(11, 13)) * 60 + parseInt(k.timestamp.slice(14, 16));
    const label = k.timestamp.slice(11, 16);
    if (!minuteMap[minKey]) minuteMap[minKey] = { label, count: 0 };
    minuteMap[minKey].count += 1;
  }

  const perMinute = Object.values(minuteMap).sort((a, b) => a.label.localeCompare(b.label));
  const peakWpm   = perMinute.reduce((mx, m) => Math.max(mx, m.count), 0);

  return { perMinute, peakWpm, totalKeystrokes };
}

// ── Build OCR sample ─────────────────────────────────────────────────────────

function buildOcrSample(date, stamp, sessionDir) {
  const candidateDirs = [];
  if (sessionDir && sessionDir.includes(path.sep + 'companies' + path.sep)) {
    candidateDirs.push(path.join(path.resolve(sessionDir, '..', '..', '..'), 'ocr', date));
  }
  candidateDirs.push(path.join(BASE, 'ocr', date));

  let dir, files;
  for (const d of candidateDirs) {
    const f = listDir(d).filter(f => f.startsWith(stamp) && f.endsWith('.jsonl'));
    if (f.length) { dir = d; files = f; break; }
  }
  if (!files || !files.length) return '';

  const lines = safeRead(path.join(dir, files[0])).split('\n').filter(Boolean);
  for (const line of lines.slice(0, 3)) {
    try {
      const obj = JSON.parse(line.replace(/^\uFEFF/, ''));
      if (obj.ocr_text) return obj.ocr_text.slice(0, 600);
    } catch {}
  }
  return '';
}

// ── Shared window-title normaliser (module scope) ─────────────────────────────

function shortName(win) {
  if (!win) return 'Unknown';
  const w = win.toLowerCase();
  if (w.includes('chrome'))                           return 'Chrome';
  if (w.includes('microsoft edge') || w.includes('msedge')) return 'Edge';
  if (w.includes('firefox'))                          return 'Firefox';
  if (w.includes('code'))                             return 'VS Code';
  if (w.includes('cursor'))                           return 'Cursor';
  if (w.includes('cmd') || w.includes('powershell') || w.includes('terminal') || w.includes('wt.exe')) return 'Terminal';
  if (w.includes('slack'))                            return 'Slack';
  if (w.includes('excel'))                            return 'Excel';
  if (w.includes('outlook'))                          return 'Outlook';
  if (w.includes('word'))                             return 'Word';
  if (w.includes('teams'))                            return 'Teams';
  if (w.includes('explorer'))                         return 'File Explorer';
  if (w.includes('notion'))                           return 'Notion';
  if (w.includes('figma'))                            return 'Figma';
  if (w.includes('zoom'))                             return 'Zoom';
  if (w.includes('discord'))                          return 'Discord';
  if (w.includes('spotify'))                          return 'Spotify';
  if (w.includes('docker'))                           return 'Docker';
  if (w.includes('postman'))                          return 'Postman';
  if (w.includes('claude'))                           return 'Claude';
  if (w.includes('chatgpt'))                          return 'ChatGPT';
  const parts = win.split(' - ');
  return parts[parts.length - 1].slice(0, 25);
}

// ── Build timeline from events.jsonl ─────────────────────────────────────────
//
// Produces TimelineSegment[] with:
//   startMin / endMin  — float minutes from session start (3 decimal places)
//   durationMin        — endMin - startMin (always > 0)
//   wallStart          — ISO 8601 absolute timestamp
//   type               — productive | neutral | distraction | idle
//   app / label        — normalised display name
//   url                — first URL seen for this run ('' when unavailable)
//   classifiedBy       — 'domain' | 'name' | 'fallback'
//
// Continuity guarantee: endMin[i] === startMin[i+1] for every adjacent pair.
// Consecutive events with the same window title are collapsed into one run,
// so the output has one segment per distinct app span, not one per raw event.

function buildTimeline(date, stamp, sessionStart) {
  // Resolve events file (new and old format)
  let eventsPath = path.join(BASE, 'logs', date, `Session_${stamp}`, 'events.jsonl');
  if (!exists(eventsPath)) {
    eventsPath = path.join(BASE, 'logs', date, `${stamp}-events.jsonl`);
  }

  const raw = safeRead(eventsPath);
  const events = raw.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l.replace(/^\uFEFF/, '')); } catch { return null; }
  }).filter(e => e && e.timestamp && !isNaN(new Date(e.timestamp).getTime()));

  if (!events.length) return { segments: [], appSwitches: [], contextSpikes: [] };

  const _originDate = sessionStart ? new Date(sessionStart) : new Date(events[0].timestamp);
  const origin = isNaN(_originDate.getTime()) ? new Date(events[0].timestamp) : _originDate;

  // ── Step 1: Collapse consecutive same-window events into runs ────────────
  // Each run = { title, url, startTs, endTs }
  // url: first non-empty active_url seen in the run
  const runs = [];
  for (const e of events) {
    const title = e.window_title || e.active_window || '';
    const url   = e.active_url   || e.url           || '';
    const last  = runs[runs.length - 1];
    if (last && last.title === title) {
      last.endTs = e.timestamp;
      if (!last.url && url) last.url = url;
    } else {
      runs.push({ title, url, startTs: e.timestamp, endTs: e.timestamp });
    }
  }

  if (!runs.length) return { segments: [], appSwitches: [], contextSpikes: [] };

  // ── Step 2: Convert runs to segments ─────────────────────────────────────
  // endMin[i] = startMin[i+1] (both derived from runs[i+1].startTs → same value).
  // Last segment: endTs + 60 seconds (1 min extension, standard convention).
  const r3 = v => Math.round(v * 1000) / 1000; // round to 3 decimal places

  const segments = runs.map((run, i) => {
    const startMs = new Date(run.startTs) - origin;
    const endMs   = i + 1 < runs.length
      ? new Date(runs[i + 1].startTs) - origin   // exact continuity: same value as next startMs
      : new Date(run.endTs) - origin + 60_000;   // last run: extend by 1 min

    const startMin    = isNaN(startMs) ? 0 : startMs / 60_000;
    const endMinVal   = Math.max(isNaN(endMs) ? startMin + 1 : endMs / 60_000, startMin + (1 / 60));
    const durationMin = endMinVal - startMin;
    const _wallMs     = origin.getTime() + (isNaN(startMs) ? 0 : startMs);
    const wallStart   = isNaN(_wallMs) ? new Date().toISOString() : new Date(_wallMs).toISOString();

    const { type, classifiedBy } = classifyWindow(run.title, run.url);
    const app = shortName(run.title);

    return {
      startMin:     r3(startMin),
      endMin:       r3(endMinVal),
      durationMin:  r3(durationMin),
      wallStart,
      type,
      app,
      label:        app,
      url:          run.url,
      classifiedBy,
    };
  });

  // ── Step 3: App switches (one per run boundary where app name changed) ───
  const appSwitches = [];
  for (let i = 1; i < runs.length; i++) {
    const from = shortName(runs[i - 1].title);
    const to   = shortName(runs[i].title);
    if (from !== to) {
      const atMs = new Date(runs[i].startTs) - origin;
      appSwitches.push({ atMin: r3(atMs / 60_000), from, to });
    }
  }

  // ── Step 4: Context spikes (≥3 switches in any 5-min window) ────────────
  const contextSpikes = [];
  const totalEndMin = segments.length ? segments[segments.length - 1].endMin : 0;
  for (let m = 0; m < totalEndMin; m += 5) {
    const sw = appSwitches.filter(s => s.atMin >= m && s.atMin < m + 5);
    if (sw.length >= 3) {
      contextSpikes.push({
        atMin:    m,
        label:    `${sw.length} switches in 5 min`,
        severity: sw.length >= 5 ? 'high' : 'medium',
      });
    }
  }

  return { segments, appSwitches, contextSpikes };
}

// ── Detect deterministic timeline patterns ────────────────────────────────────
//
// Operates solely on timeline_segments (Phase 1) and appSwitches.
// No AI, no scoring — pure structural detection.
//
// Definitions:
//   focus block       — consecutive productive segments spanning ≥ 20 min
//   distraction block — consecutive distraction segments spanning ≥ 10 min
//   idle streak       — consecutive idle segments spanning ≥ 5 min
//   switch burst      — ≥ 3 app changes within any rolling 15-min window
//
// All fields are deterministic and reproducible given the same segments input.

function detectTimelinePatterns(segments, appSwitches) {
  const empty = {
    focusBlocks: [], distractionBlocks: [], idleStreaks: [], switchBursts: [],
    timelineSummary: {
      totalFocusMin: 0, totalDistractionMin: 0, totalIdleMin: 0,
      longestFocusMin: 0, longestDistractionMin: 0, longestIdleMin: 0,
      switchBurstCount: 0,
    },
  };
  if (!segments || !segments.length) return empty;

  const r1 = v => Math.round(v * 10) / 10; // 1 decimal place for display minutes

  // Interpolate ISO wall-clock time at a given minute offset using segment wallStart.
  function wallAtMin(min) {
    for (const seg of segments) {
      if (seg.startMin <= min && seg.endMin > min) {
        const offsetMs = (min - seg.startMin) * 60_000;
        return new Date(new Date(seg.wallStart).getTime() + offsetMs).toISOString();
      }
    }
    // Past last segment: extrapolate from its wallStart
    const last = segments[segments.length - 1];
    const offsetMs = (min - last.startMin) * 60_000;
    return new Date(new Date(last.wallStart).getTime() + offsetMs).toISOString();
  }

  // Build a block descriptor from a contiguous run of same-type segments.
  function makeBlock(run) {
    const first = run[0];
    const last  = run[run.length - 1];

    // App with most accumulated time in this run
    const appTime = {};
    for (const s of run) appTime[s.app] = (appTime[s.app] || 0) + s.durationMin;
    const dominantApp = Object.entries(appTime).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

    return {
      startMin:     r1(first.startMin),
      endMin:       r1(last.endMin),
      durationMin:  r1(last.endMin - first.startMin),
      wallStart:    first.wallStart,
      wallEnd:      new Date(new Date(last.wallStart).getTime() + last.durationMin * 60_000).toISOString(),
      dominantApp,
      segmentCount: run.length,
    };
  }

  // Detect runs of targetType and emit a block when total span ≥ minDuration.
  function detectBlocks(targetType, minDuration) {
    const blocks = [];
    let run = [];

    const flush = () => {
      if (run.length) {
        if (run[run.length - 1].endMin - run[0].startMin >= minDuration) {
          blocks.push(makeBlock(run));
        }
        run = [];
      }
    };

    for (const seg of segments) {
      seg.type === targetType ? run.push(seg) : flush();
    }
    flush(); // handle trailing run
    return blocks;
  }

  const focusBlocks       = detectBlocks('productive',  20);
  const distractionBlocks = detectBlocks('distraction', 10);
  const idleStreaks        = detectBlocks('idle',         5);

  // Switch bursts: ≥ 3 app changes in any rolling 15-min window.
  // Non-overlapping: after recording a burst advance past its last switch.
  const sw = (appSwitches || []).slice().sort((a, b) => a.atMin - b.atMin);
  const switchBursts = [];
  let i = 0;

  while (i < sw.length) {
    const windowStart = sw[i].atMin;
    const windowEnd   = windowStart + 15;

    let j = i;
    while (j < sw.length && sw[j].atMin < windowEnd) j++;
    const count = j - i; // number of switches in this window

    if (count >= 3) {
      const burstStart = sw[i].atMin;
      const burstEnd   = sw[j - 1].atMin;

      // Most-switched-to app within the burst window
      const toCounts = {};
      for (let k = i; k < j; k++) toCounts[sw[k].to] = (toCounts[sw[k].to] || 0) + 1;
      const dominantApp = Object.entries(toCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

      switchBursts.push({
        startMin:     r1(burstStart),
        endMin:       r1(burstEnd),
        durationMin:  r1(burstEnd - burstStart),
        wallStart:    wallAtMin(burstStart),
        wallEnd:      wallAtMin(burstEnd),
        dominantApp,
        segmentCount: count + 1, // n switches → n+1 distinct app spans
      });
      i = j; // advance past this burst (non-overlapping windows)
    } else {
      i++;
    }
  }

  // Aggregate summary
  const sum = (arr, key) => arr.reduce((a, b) => a + b[key], 0);
  const max = (arr, key) => arr.reduce((a, b) => Math.max(a, b[key]), 0);

  return {
    focusBlocks,
    distractionBlocks,
    idleStreaks,
    switchBursts,
    timelineSummary: {
      totalFocusMin:        r1(sum(focusBlocks,       'durationMin')),
      totalDistractionMin:  r1(sum(distractionBlocks, 'durationMin')),
      totalIdleMin:         r1(sum(idleStreaks,        'durationMin')),
      longestFocusMin:      r1(max(focusBlocks,        'durationMin')),
      longestDistractionMin:r1(max(distractionBlocks,  'durationMin')),
      longestIdleMin:       r1(max(idleStreaks,         'durationMin')),
      switchBurstCount:     switchBursts.length,
    },
  };
}

// ── Get screenshot entries for a session ─────────────────────────────────────
// Returns { paths: string[], types: string[] } — always equal-length parallel arrays.
// types[i]: "image" | "duplicate"
// paths[i]: absolute path for images; '' for duplicates
//
// Priority:
//   1. snapshot metadata (master.json snapshots[]) — includes all entries, never filtered
//   2. filesystem scan — only used when master.json has NO snapshots array
//
// Backward compatible: old sessions without screenshot_type infer from path presence.

function getScreenshotEntries(date, stamp, snapshots) {
  if (snapshots && snapshots.length > 0) {
    const paths = [];
    const types = [];

    for (const s of snapshots) {
      if (s.screenshot_type === 'duplicate') {
        // Explicit duplicate marker (new sessions)
        paths.push('');
        types.push('duplicate');
      } else if (s.screenshot_path) {
        // Real image — new and old sessions
        paths.push(s.screenshot_path);
        types.push('image');
      } else {
        // Old sessions: no screenshot_type, null/empty path → infer as duplicate
        paths.push('');
        types.push('duplicate');
      }
    }

    // Always return snapshot-derived arrays — never fall through to filesystem
    // when snapshot data is present (even if all entries are duplicates).
    return { paths, types };
  }

  // Filesystem fallback — only reached when master.json has no snapshots array.
  const newDir = path.join(BASE, 'screenshots', date, `Session_${stamp}`);
  const oldDir = path.join(BASE, 'screenshots', date);

  for (const dir of [newDir, oldDir]) {
    const imgs = listDir(dir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    if (imgs.length) {
      const paths = imgs.map(f => path.join(dir, f));
      const types = paths.map(() => 'image');
      return { paths, types };
    }
  }

  return { paths: [], types: [] };
}

// ── Build a session object ────────────────────────────────────────────────────

function buildSession(date, stamp, masterPath) {
  // --- resolve master.json path ---
  if (!masterPath) {
    // Try old logs/ paths first (cheap), then scan companies/ structure
    const newLog = path.join(BASE, 'logs', date, `Session_${stamp}`, 'master.json');
    const oldLog = path.join(BASE, 'logs', date, `${stamp}-master.json`);
    if (exists(newLog)) masterPath = newLog;
    else if (exists(oldLog)) masterPath = oldLog;
    else {
      const companiesDir = path.join(BASE, 'companies');
      outer: for (const comp of listDir(companiesDir)) {
        for (const emp of listDir(path.join(companiesDir, comp, 'employees'))) {
          const candidate = path.join(companiesDir, comp, 'employees', emp, 'sessions', date, `Session_${stamp}`, 'master.json');
          if (exists(candidate)) { masterPath = candidate; break outer; }
        }
      }
    }
  }
  if (!masterPath || !exists(masterPath)) return null;

  const master = safeParse(masterPath);
  if (!master) return null;

  // ── Deterministic analytics (written by AnalyticsEngine after each session) ──
  const sessionDir      = path.dirname(masterPath);
  const analyticsData   = safeParse(path.join(sessionDir, 'analytics.json'));
  const hourlyRaw       = safeParse(path.join(sessionDir, 'hourly_metrics.json'));

  // ── Layered AI pipeline outputs (micro/hour/daily) ────────────────────────
  const microRaw  = safeParse(path.join(sessionDir, 'micro_analysis.json'));
  const hourRaw   = safeParse(path.join(sessionDir, 'hour_analysis.json'));
  const dateDir   = path.dirname(sessionDir);
  const dailyRaw  = safeParse(path.join(dateDir, 'daily_analysis.json'));

  // ── Work segments (segments.json envelope + context_labels.json merge) ────────
  const segmentsRaw = safeParse(path.join(sessionDir, 'segments.json'));
  const contextRaw  = safeParse(path.join(sessionDir, 'context_labels.json'));

  const rawSegArr = segmentsRaw
    ? (Array.isArray(segmentsRaw) ? segmentsRaw : (segmentsRaw.segments || []))
    : [];

  // Build context lookup by segment_index
  const ctxMap = {};
  if (Array.isArray(contextRaw)) {
    for (const c of contextRaw) {
      if (typeof c.segment_index === 'number') ctxMap[c.segment_index] = c;
    }
  }

  const workSegments = rawSegArr.map(s => {
    const ctx = ctxMap[s.index] || {};
    return {
      index:            s.index,
      start_time:       s.start_time        || '',
      end_time:         s.end_time          || '',
      duration_seconds: s.duration_seconds  || 0,
      app:              s.app               || '',
      window_title:     s.window_title      || '',
      url_domain:       s.url_domain        || '',
      keys:             s.keys              || 0,
      clicks:           s.clicks            || 0,
      scrolls:          s.scrolls           || 0,
      segment_type:     s.segment_type      || 'active',
      activity_state:   s.activity_state    || s.segment_type || 'active',
      context_type:     ctx.context_type    || '',
      work_relevance:   ctx.work_relevance  || '',
      app_category:     ctx.app_category    || '',
    };
  });

  const sum  = master.summary || {};
  const meta = master.meta    || {};
  const snapshots = master.snapshots || [];

  const sessionStart = `${date} ${sum.session_start || stamp.replace(/-/g, ':')}`;
  let   sessionEnd   = `${date} ${sum.session_end   || stamp.replace(/-/g, ':')}`;
  // Midnight-crossing: if end timestamp is before start, the session crossed midnight.
  // Add one day to the end so created_at and duration are correct.
  if (new Date(sessionEnd) < new Date(sessionStart)) {
    const d = new Date(sessionEnd);
    d.setDate(d.getDate() + 1);
    sessionEnd = d.toISOString().replace('T', ' ').slice(0, 19);
  }
  const durationSec  = sum.duration_seconds || 60;
  const totalMin     = Math.max(1, Math.round(durationSec / 60));
  const idlePct      = sum.idle_percent || 0;
  const idleMin      = Math.round(totalMin * idlePct / 100);
  const activeMin    = Math.max(1, totalMin - idleMin);

  // --- Top apps from snapshots (grouped by process_name to prevent duplicates) ---
  const appMap = new Map(); // canonical key → { ticks, url, idleSec, titleFreq }

  for (const s of snapshots) {
    // Primary dedup key: process_name without extension (e.g. "chrome", "code")
    // Fallback: shortName of active_window lowercased
    const proc = (s.process_name || '').toLowerCase().replace(/\.exe$/i, '').trim();
    const key  = proc || shortName(s.active_window || '').toLowerCase();
    if (!key || key === 'unknown') continue;

    let entry = appMap.get(key);
    if (!entry) {
      entry = { ticks: 0, url: '', idleSec: 0, titleFreq: {} };
      appMap.set(key, entry);
    }
    entry.ticks   += 1;
    entry.idleSec += (s.idle_seconds_this_period || 0);
    // Keep first non-empty URL seen for this process
    if (!entry.url && s.active_url) entry.url = s.active_url;
    // Track window title frequency to pick best display name
    const title = s.active_window || '';
    if (title) entry.titleFreq[title] = (entry.titleFreq[title] || 0) + 1;
  }

  const topWindows = [...appMap.entries()]
    .map(([key, d]) => {
      const topTitle = Object.entries(d.titleFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const seconds  = Math.round(d.ticks * durationSec / Math.max(1, snapshots.length));
      return {
        app:          shortName(topTitle) || key,
        process:      key,
        url:          d.url || '',
        window_title: topTitle,
        minutes:      Math.round(seconds / 60),
        idle_seconds: d.idleSec,
      };
    })
    .filter(w => w.minutes > 0)            // omit zero-time rows
    .sort((a, b) => b.minutes - a.minutes) // most-used first
    .slice(0, 8);

  // --- AI report ---
  const { data: aiData, source: reportType } = pickAiReportJson(date, stamp);
  const modelUsed   = pickAiReportModel(date, stamp);
  const aiFinalText = pickAiFinalText(date, stamp);

  // All models with valid data for this session (may be >1 when GK + NDA both have reports)
  const allModels  = collectAllModels(date, stamp);
  const primaryMeta = allModels[0] || MODEL_META[modelUsed] || MODEL_META.local;
  const modelKey   = primaryMeta.key;
  const modelShort = primaryMeta.short;

  console.log('Session parsed:', `${date}_${stamp}`, '|', modelKey, '|', allModels.map(m => m.key).join('+') || 'none');

  // Normalize scores: AI JSONs use 0-10 scale → ×10
  // But the GK_IMG / older grok json also uses 0-10. Multiply all.
  let focusScore    = 50;
  let workflowScore = 50;
  let toolScore     = 50;
  let ctxScore      = 50;
  let overallScore  = 50;
  let mainTasks       = [];
  let mainDistract    = [];
  let redFlags        = [];
  let recommendations = [];
  let topAps          = topWindows.slice(0, 6).map(w => w.app);

  if (aiData) {
    const scale = (aiData.overall_productivity_score !== undefined && aiData.overall_productivity_score <= 10) ? 10 : 1;
    focusScore    = Math.round((aiData.focus_score    || 0) * scale);
    workflowScore = Math.round((aiData.workflow_structure_score || 0) * scale);
    toolScore     = Math.round((aiData.tool_usage_score || 0) * scale);
    ctxScore      = Math.round((aiData.context_switching_score || 0) * scale);
    overallScore  = Math.round((aiData.overall_productivity_score || 0) * scale);
    mainTasks       = aiData.main_tasks        || [];
    mainDistract    = aiData.main_distractions || [];
    redFlags        = aiData.red_flags         || [];
    recommendations = aiData.recommendations   || [];
    topAps          = aiData.top_apps || topAps;
  } else {
    // Estimate from raw telemetry
    const keys    = sum.key_count || 0;
    const swCount = sum.window_switches || 0;
    focusScore    = Math.round(Math.min(100, Math.max(0, 100 - idlePct * 1.5 + (keys / totalMin) * 0.3)));
    workflowScore = Math.round(Math.min(100, activeMin / totalMin * 100));
    toolScore     = Math.min(100, Math.round(appMap.size * 8 + 40));
    ctxScore      = Math.max(20, Math.round(100 - swCount * 5));
    overallScore  = Math.round((focusScore + workflowScore + toolScore + ctxScore) / 4);
    redFlags      = idlePct > 30 ? [`High idle rate: ${Math.round(idlePct)}%`] : [];
    recommendations = [
      idlePct > 25 ? 'Reduce idle periods with a structured break schedule' : 'Maintain current focus cadence',
      swCount > 10  ? 'Batch similar tasks to reduce context switching'       : 'Context switching is well-managed',
    ];
  }

  // --- Keystroke data ---
  const { perMinute, peakWpm, totalKeystrokes } = buildKeystrokeData(date, stamp, sessionStart, sessionDir);

  // --- OCR sample ---
  const ocrSample = buildOcrSample(date, stamp, sessionDir);

  // --- Timeline from events.jsonl ---
  const { segments, appSwitches, contextSpikes } = buildTimeline(date, stamp, sessionStart);

  // --- Timeline Intelligence (Phase 2 — deterministic, no AI) ---
  const timelineIntel = detectTimelinePatterns(segments, appSwitches);

  // --- Role-Based Score (deterministic, no AI) ---
  const roleBasedScore = computeRoleBasedScore({
    role:                  sum.role,
    total_minutes:         totalMin,
    idle_minutes_estimate: idleMin,
    timeline_summary:      timelineIntel.timelineSummary,
    focus_blocks:          timelineIntel.focusBlocks,
    distraction_blocks:    timelineIntel.distractionBlocks,
    idle_streaks:          timelineIntel.idleStreaks,
  });

  // --- Screenshots ---
  const { paths: screenshotPaths, types: screenshotTypes } = getScreenshotEntries(date, stamp, snapshots);

  // --- Detected tasks from top windows ---
  const DISTRACT_SET = new Set(['youtube','twitter','reddit','instagram','facebook','nytimes','news']);
  const detectedTasks = topWindows.slice(0, 5).map(w => ({
    name:              w.app,
    duration_minutes:  w.minutes,
    apps:              [w.app],
    confidence:        aiData ? 80 : 60,
  }));

  const startISO = new Date(sessionStart).toISOString();
  const endISO   = new Date(sessionEnd).toISOString();

  const fallbackSummary = `${totalMin}-minute session. Overall: ${overallScore}/100. Active: ${activeMin} min, Idle: ${idleMin} min. ${sum.window_switches || appSwitches.length} app switches.`;
  const execSummary = extractExecSummary(aiFinalText, fallbackSummary);

  return {
    id:            `${date}_${stamp}`,
    session_start: startISO,
    session_end:   endISO,
    created_at:    endISO,

    // Session lifecycle status: completed | in_progress | recovered
    session_status: master.status || 'completed',

    // Employee identity
    userName:     meta.user_name    || MACHINE_USER,
    company_id:   meta.company_id   || COMPANY_ID,
    employee_id:  meta.employee_id  || resolveEmployeeId(sum.role),
    employee_uid: meta.employee_uid || `${COMPANY_ID}_${resolveEmployeeId(sum.role)}`,

    // Identity
    role:        sum.role        || 'N/A',
    client:      sum.client      || 'N/A',
    task:        sum.task        || 'N/A',
    description: sum.description || '',

    // Duration
    total_minutes:           totalMin,
    active_minutes_estimate: activeMin,
    idle_minutes_estimate:   idleMin,

    // Scores (0-100)
    focus_score:                  focusScore,
    workflow_structure_score:     workflowScore,
    tool_usage_score:             toolScore,
    context_switching_score:      ctxScore,
    overall_productivity_score:   overallScore,

    // Metadata
    report_type:    reportType,
    model_used:     modelUsed,
    modelKey,
    modelShort,
    allModels,
    has_ai_report:  !!aiData,

    // AI analysis
    executive_summary:  execSummary,
    main_tasks:         mainTasks,
    main_distractions:  mainDistract,
    top_apps:           topAps,
    red_flags:          redFlags,
    recommendations:    recommendations,
    claimed_task:       sum.task || 'Tracked via TELER',
    task_overlap_pct:   aiData ? (mainTasks.length > 0 ? Math.min(100, mainTasks.length * 30) : 5) : null,

    // Timeline
    timeline_segments:  segments,
    app_switches:       appSwitches,
    context_spikes:     contextSpikes,

    // Timeline Intelligence (Phase 2 — deterministic, no AI)
    focus_blocks:       timelineIntel.focusBlocks,
    distraction_blocks: timelineIntel.distractionBlocks,
    idle_streaks:       timelineIntel.idleStreaks,
    switch_bursts:      timelineIntel.switchBursts,
    timeline_summary:   timelineIntel.timelineSummary,

    // Role-Based Score (deterministic, no AI)
    role_based_score:   roleBasedScore,

    // Detected tasks
    detected_tasks:  detectedTasks,
    task_breakdown:  [],

    // Evidence
    evidence: {
      screenshot_count:     screenshotPaths.filter((_, i) => screenshotTypes[i] === 'image').length,
      screenshot_urls:      screenshotPaths,
      screenshot_types:     screenshotTypes,
      ocr_sample:           ocrSample,
      keystroke_per_minute: perMinute,
      peak_wpm:             peakWpm,
      total_keystrokes:     totalKeystrokes,
      top_apps_minutes:     topWindows.slice(0, 6),
    },

    // Raw telemetry
    key_count:    sum.key_count   || totalKeystrokes,
    mouse_clicks: sum.mouse_clicks || 0,
    idle_percent: idlePct,

    // Full AI report text
    ai_report_text: aiFinalText,

    // Deterministic analytics (null when not yet generated)
    analytics:      analyticsData  || null,
    hourly_metrics: Array.isArray(hourlyRaw) ? hourlyRaw : [],
    segments:       workSegments,

    // Layered AI pipeline outputs (empty / null when not yet generated)
    micro_windows: Array.isArray(microRaw) ? microRaw : [],
    hour_blocks:   Array.isArray(hourRaw)  ? hourRaw  : [],
    daily_summary: (dailyRaw && !Array.isArray(dailyRaw)) ? dailyRaw : null,
  };
}

// ── Discover all sessions across all dates ────────────────────────────────────

function discoverSessions() {
  const all = [];
  const seen = new Set();

  // New structure: companies/{companyId}/employees/{employeeId}/sessions/{date}/Session_{stamp}/
  const companiesDir = path.join(BASE, 'companies');
  for (const comp of listDir(companiesDir)) {
    const employeesDir = path.join(companiesDir, comp, 'employees');
    for (const emp of listDir(employeesDir)) {
      const sessionsDir = path.join(employeesDir, emp, 'sessions');
      for (const date of listDir(sessionsDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
        const dateDir = path.join(sessionsDir, date);
        for (const entry of listDir(dateDir)) {
          if (!entry.startsWith('Session_')) continue;
          const stamp = entry.replace('Session_', '');
          const masterPath = path.join(dateDir, entry, 'master.json');
          if (exists(masterPath)) {
            const key = `${date}_${stamp}`;
            if (!seen.has(key)) { seen.add(key); all.push({ date, stamp, masterPath }); }
          }
        }
      }
    }
  }

  // Old structure: logs/{date}/Session_{stamp}/  and  logs/{date}/{stamp}-master.json
  for (const date of listDates('logs')) {
    const dateDir = path.join(BASE, 'logs', date);

    for (const entry of listDir(dateDir)) {
      if (entry.startsWith('Session_')) {
        const stamp = entry.replace('Session_', '');
        const masterPath = path.join(dateDir, entry, 'master.json');
        if (exists(masterPath)) {
          const key = `${date}_${stamp}`;
          if (!seen.has(key)) { seen.add(key); all.push({ date, stamp, masterPath }); }
        }
      } else if (entry.endsWith('-master.json')) {
        const stamp = entry.replace('-master.json', '');
        if (/^\d{2}-\d{2}-\d{2}$/.test(stamp)) {
          const masterPath = path.join(dateDir, entry);
          const key = `${date}_${stamp}`;
          if (!seen.has(key)) { seen.add(key); all.push({ date, stamp, masterPath }); }
        }
      }
    }
  }

  return all;
}

// ── Multi-Session Memory ───────────────────────────────────────────────────────
//
// Deterministic historical baseline and trend layer built from existing session
// data. No AI, no LLM, no database. Pure aggregation over timeline_summary and
// core session fields from Phase 1 and Phase 2.
//
// Baseline windows:   last 7 sessions / last 14 sessions / all sessions
// Trend comparison:   last 7 vs prior 7 (sessions 8–14 from end)
// Trend threshold:    |delta| < 5% → stable; otherwise improving or worsening
// Consistency:        session count, active days, variance metrics

// ── Aggregation helpers ───────────────────────────────────────────────────────

const r1 = v => Math.round(v * 10) / 10;

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return r1(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

// ── Baseline computation ─────────────────────────────────────────────────────
// Takes an ordered array of sessions (any length). Returns a single baseline
// object representing the average behaviour across those sessions.

function computeBaseline(sessions) {
  const n = sessions.length;
  if (!n) return null;

  const pick  = fn => sessions.map(fn);
  const avg   = fn => r1(mean(pick(fn)));

  return {
    sessionCount:               n,
    avgProductivityScore:       avg(s => s.overall_productivity_score              || 0),
    avgRoleScore:               avg(s => s.role_based_score?.score                 ?? 0),
    avgIdleMin:                 avg(s => s.idle_minutes_estimate                   || 0),
    avgFocusMin:                avg(s => s.timeline_summary?.totalFocusMin         || 0),
    avgDistractionMin:          avg(s => s.timeline_summary?.totalDistractionMin   || 0),
    avgSwitchBurstCount:        avg(s => s.timeline_summary?.switchBurstCount      || 0),
    avgSessionDurationMin:      avg(s => s.total_minutes                           || 0),
    focusBlockFrequency:        avg(s => (s.focus_blocks        || []).length),
    distractionBlockFrequency:  avg(s => (s.distraction_blocks  || []).length),
    idleStreakFrequency:        avg(s => (s.idle_streaks         || []).length),
  };
}

// ── Trend computation ─────────────────────────────────────────────────────────
// Compares a recent baseline vs a prior baseline for each metric.
// higherIsBetter = true  → increase means 'improving'
// higherIsBetter = false → decrease means 'improving'

function trendDir(recentVal, priorVal, higherIsBetter) {
  if (!priorVal) return 'stable';
  const delta = (recentVal - priorVal) / priorVal; // relative change
  if (Math.abs(delta) < 0.05) return 'stable';
  return (delta > 0) === higherIsBetter ? 'improving' : 'worsening';
}

function computeTrends(recent, prior) {
  if (!recent || !prior) {
    return {
      productivityTrend: 'stable',
      idleTrend:         'stable',
      focusTrend:        'stable',
      distractionTrend:  'stable',
      switchBurstTrend:  'stable',
      comparedAgainst:   'insufficient history',
    };
  }
  return {
    productivityTrend: trendDir(recent.avgProductivityScore,  prior.avgProductivityScore,  true),
    idleTrend:         trendDir(recent.avgIdleMin,            prior.avgIdleMin,            false),
    focusTrend:        trendDir(recent.avgFocusMin,           prior.avgFocusMin,           true),
    distractionTrend:  trendDir(recent.avgDistractionMin,     prior.avgDistractionMin,     false),
    switchBurstTrend:  trendDir(recent.avgSwitchBurstCount,   prior.avgSwitchBurstCount,   false),
    comparedAgainst:   `last ${recent.sessionCount} vs prior ${prior.sessionCount} sessions`,
  };
}

// ── Consistency computation ───────────────────────────────────────────────────
// Uses all available sessions to measure regularity and score stability.

function computeConsistency(sessions) {
  const n = sessions.length;
  if (!n) return null;

  const dates = new Set(
    sessions.map(s => (s.session_start || '').slice(0, 10)).filter(Boolean)
  );
  const activeDaysCount = dates.size;

  return {
    sessionCount:      n,
    activeDaysCount,
    avgSessionsPerDay: r1(n / Math.max(1, activeDaysCount)),
    scoreVariance:     variance(sessions.map(s => s.overall_productivity_score || 0)),
    durationVariance:  variance(sessions.map(s => s.total_minutes              || 0)),
  };
}

// ── Employee memory orchestrator ──────────────────────────────────────────────
// Takes all sessions for one employee, returns a complete memory object.
// Sessions may arrive in any order — sorted internally.

function computeEmployeeMemory(sessions) {
  if (!sessions || !sessions.length) return null;

  // Sort ascending by session_start so slicing from the end gives "most recent"
  const sorted = sessions
    .slice()
    .sort((a, b) => new Date(a.session_start) - new Date(b.session_start));

  const n = sorted.length;

  // Baseline windows (most recent N)
  const last7    = sorted.slice(Math.max(0, n - 7));
  const last14   = sorted.slice(Math.max(0, n - 14));
  const baseline7   = computeBaseline(last7);
  const baseline14  = computeBaseline(last14);
  const baselineAll = computeBaseline(sorted);

  // Prior 7: the 7 sessions immediately before the last 7
  const prior7      = n >= 8 ? sorted.slice(Math.max(0, n - 14), n - 7) : null;
  const priorBaseline = prior7 && prior7.length ? computeBaseline(prior7) : null;

  const trends      = computeTrends(baseline7, priorBaseline);
  const consistency = computeConsistency(sorted);

  return {
    computed_at:             new Date().toISOString(),
    session_count_available: n,
    baseline_7:              baseline7,
    baseline_14:             baseline14,
    baseline_all:            baselineAll,
    trends,
    consistency,
  };
}

// ── Role-Based Scoring ────────────────────────────────────────────────────────
//
// Deterministic, no AI, no LLM.
// Each session is scored against role-specific expectations derived from
// timeline_summary (Phase 2) and raw session fields.
//
// Scoring formula:
//   1. Normalize each metric to a 0–1 ratio or per-hour rate
//   2. Map each normalized value to a sub-score 0–100 using role targets
//   3. Compute weighted average of all sub-scores (weights sum to 100 per role)
//   4. Clamp result to 0–100
//
// All thresholds and weights are explicitly defined here — no hidden magic.
// Version tag 'v1' lets future changes be tracked without breaking consumers.

// ── Role normalization ────────────────────────────────────────────────────────

const ROLE_ALIASES = {
  developer: ['develop', 'engineer', 'programmer', 'software', 'coder', 'devops', 'backend', 'frontend', 'fullstack'],
  designer:  ['design', 'ux', 'ui ', 'ui/', 'graphic', 'creative', 'product design'],
  manager:   ['manag', 'lead', 'director', 'head of', 'vp ', 'cto', 'ceo', 'coo', 'exec', 'principal'],
  sales:     ['sales', 'account exec', 'account manag', 'business dev', 'bdr', 'sdr', 'revenue'],
  support:   ['support', 'helpdesk', 'help desk', 'customer success', 'customer service', 'service desk', 'qa', 'quality'],
};

function normalizeRole(rawRole) {
  const r = (rawRole || '').toLowerCase().trim();
  if (!r || r === 'n/a' || r === 'unknown') return 'general';
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.some(a => r.includes(a))) return role;
  }
  return 'general';
}

// ── Role profiles ─────────────────────────────────────────────────────────────
// targets: thresholds used to compute sub-scores
//   focusRatio:            fraction of session time expected in productive work
//   distractionRatioCap:   fraction at which distraction sub-score hits 0
//   idleRatioCap:          fraction at which idle sub-score hits 0
//   switchBurstsPerHrCap:  bursts/hr at which switch sub-score hits 0
//   optimalDurationMin:    session length for full duration sub-score
//   focusBlocksPerHrTarget:focus blocks/hr for full focusBlock sub-score
//   distractBlocksPerHrCap:blocks/hr at which distractBlock sub-score hits 0
//   idleStreaksPerHrCap:   streaks/hr at which idleStreak sub-score hits 0
//
// weights: relative contribution of each factor (all sum to 100)

const ROLE_PROFILES = {

  developer: {
    label: 'Developer',
    targets: {
      focusRatio:             0.55,  // expect 55% of session in productive focus
      distractionRatioCap:    0.10,
      idleRatioCap:           0.20,
      switchBurstsPerHrCap:   2.0,
      optimalDurationMin:     90,
      focusBlocksPerHrTarget: 1.0,
      distractBlocksPerHrCap: 0.8,
      idleStreaksPerHrCap:     1.0,
    },
    weights: {
      focus:             28,
      distraction:       22,
      idle:              12,
      switchBursts:      18,
      sessionDuration:    6,
      focusBlocks:        8,
      distractionBlocks:  4,
      idleStreaks:         2,
    }, // sum = 100
  },

  designer: {
    label: 'Designer',
    targets: {
      focusRatio:             0.45,  // creative work allows more context
      distractionRatioCap:    0.18,
      idleRatioCap:           0.22,
      switchBurstsPerHrCap:   3.0,
      optimalDurationMin:     75,
      focusBlocksPerHrTarget: 0.8,
      distractBlocksPerHrCap: 1.2,
      idleStreaksPerHrCap:     1.5,
    },
    weights: {
      focus:             22,
      distraction:       18,
      idle:              12,
      switchBursts:      14,
      sessionDuration:    6,
      focusBlocks:       12,
      distractionBlocks: 10,
      idleStreaks:         6,
    }, // sum = 100
  },

  manager: {
    label: 'Manager',
    targets: {
      focusRatio:             0.25,  // managers operate on meetings + short bursts
      distractionRatioCap:    0.25,
      idleRatioCap:           0.35,
      switchBurstsPerHrCap:   5.0,   // switching is normal for managers
      optimalDurationMin:     45,
      focusBlocksPerHrTarget: 0.5,
      distractBlocksPerHrCap: 2.0,
      idleStreaksPerHrCap:     2.5,
    },
    weights: {
      focus:             10,
      distraction:       18,
      idle:              14,
      switchBursts:       8,   // low penalty — switching is part of the role
      sessionDuration:   10,
      focusBlocks:        6,
      distractionBlocks: 16,
      idleStreaks:        18,
    }, // sum = 100
  },

  sales: {
    label: 'Sales',
    targets: {
      focusRatio:             0.30,  // CRM work, calls, proposals — moderate focus
      distractionRatioCap:    0.22,
      idleRatioCap:           0.30,
      switchBurstsPerHrCap:   4.0,
      optimalDurationMin:     50,
      focusBlocksPerHrTarget: 0.6,
      distractBlocksPerHrCap: 1.5,
      idleStreaksPerHrCap:     2.0,
    },
    weights: {
      focus:             14,
      distraction:       20,
      idle:              16,
      switchBursts:      12,
      sessionDuration:   10,
      focusBlocks:        8,
      distractionBlocks: 12,
      idleStreaks:         8,
    }, // sum = 100
  },

  support: {
    label: 'Support',
    targets: {
      focusRatio:             0.35,  // responsive ticket work — some focus expected
      distractionRatioCap:    0.15,  // strict: distraction hurts response time
      idleRatioCap:           0.18,  // strict: idle = unresponsive
      switchBurstsPerHrCap:   5.0,   // ticket-hopping is inherent
      optimalDurationMin:     50,
      focusBlocksPerHrTarget: 0.7,
      distractBlocksPerHrCap: 1.0,
      idleStreaksPerHrCap:     1.2,
    },
    weights: {
      focus:             14,
      distraction:       20,
      idle:              22,   // highest weight — idle = not handling tickets
      switchBursts:      10,
      sessionDuration:    8,
      focusBlocks:       10,
      distractionBlocks: 10,
      idleStreaks:         6,
    }, // sum = 100
  },

  general: {
    label: 'General',
    targets: {
      focusRatio:             0.40,
      distractionRatioCap:    0.20,
      idleRatioCap:           0.25,
      switchBurstsPerHrCap:   3.5,
      optimalDurationMin:     60,
      focusBlocksPerHrTarget: 0.8,
      distractBlocksPerHrCap: 1.5,
      idleStreaksPerHrCap:     1.8,
    },
    weights: {
      focus:             20,
      distraction:       20,
      idle:              15,
      switchBursts:      15,
      sessionDuration:    8,
      focusBlocks:        8,
      distractionBlocks:  8,
      idleStreaks:         6,
    }, // sum = 100
  },
};

// ── Explanation strings ───────────────────────────────────────────────────────
// One string per factor, generated from sub-score tier.
// Tier: high ≥ 75 (positive), mid 40–74 (neutral), low < 40 (negative).

const FACTOR_COPY = {
  focus: {
    high: label => `Strong focus time aligns with ${label} role expectations`,
    mid:  label => `Moderate focus time — slightly below ${label} targets`,
    low:  label => `Insufficient focus time for a ${label} role`,
  },
  distraction: {
    high: label => `Distraction well-controlled for a ${label} role`,
    mid:  label => `Distraction within acceptable range for ${label}`,
    low:  label => `High distraction time reduced score for a ${label} role`,
  },
  idle: {
    high: label => `Idle time within expected limits for ${label}`,
    mid:  label => `Moderate idle time — within ${label} tolerance`,
    low:  label => `Excessive idle time flagged for a ${label} role`,
  },
  switchBursts: {
    high: label => `App switching rate within ${label} expectations`,
    mid:  label => `Some context fragmentation detected`,
    low:  label => `Frequent switch bursts reduced score for a ${label} role`,
  },
  sessionDuration: {
    high: label => `Session length consistent with ${label} work patterns`,
    mid:  label => `Session shorter than typical ${label} sessions`,
    low:  label => `Very short session — limited data for ${label} scoring`,
  },
  focusBlocks: {
    high: label => `Good focus block frequency matched ${label} expectations`,
    mid:  label => `Moderate focus block frequency`,
    low:  label => `Low focus block frequency for a ${label} role`,
  },
  distractionBlocks: {
    high: label => `Distraction episodes well-managed for ${label}`,
    mid:  label => `Distraction block frequency within tolerance`,
    low:  label => `Too many distraction episodes for a ${label} role`,
  },
  idleStreaks: {
    high: label => `Idle streaks within expected range for ${label}`,
    mid:  label => `Some idle gaps detected`,
    low:  label => `Frequent idle streaks reduced score for a ${label} role`,
  },
};

function buildExplanations(subScores, roleLabel) {
  return Object.entries(subScores).map(([key, score]) => {
    const tier = score >= 75 ? 'high' : score >= 40 ? 'mid' : 'low';
    return FACTOR_COPY[key]?.[tier]?.(roleLabel) ?? `${key}: ${score}/100`;
  });
}

// ── Score computation ─────────────────────────────────────────────────────────

function computeRoleBasedScore(partialSession) {
  const rawRole = partialSession.role;
  const role    = normalizeRole(rawRole);
  const profile = ROLE_PROFILES[role];

  const totalMin = Math.max(partialSession.total_minutes || 1, 1);
  const hoursf   = Math.max(totalMin / 60, 1 / 10); // hours, min = 6 min to avoid ÷0

  const ts           = partialSession.timeline_summary  || {};
  const focusMin     = ts.totalFocusMin                 || 0;
  const distrMin     = ts.totalDistractionMin           || 0;
  const switchBursts = ts.switchBurstCount              || 0;
  const idleMin      = partialSession.idle_minutes_estimate || 0;
  const focusBlocks  = (partialSession.focus_blocks        || []).length;
  const distrBlocks  = (partialSession.distraction_blocks  || []).length;
  const idleStreaks   = (partialSession.idle_streaks        || []).length;

  // Normalized metrics
  const focusRatio        = focusMin     / totalMin;
  const distrRatio        = distrMin     / totalMin;
  const idleRatio         = idleMin      / totalMin;
  const switchBurstsPerHr = switchBursts / hoursf;
  const focusBlocksPerHr  = focusBlocks  / hoursf;
  const distrBlocksPerHr  = distrBlocks  / hoursf;
  const idleStreaksPerHr  = idleStreaks   / hoursf;

  const t  = profile.targets;
  const w  = profile.weights;
  const c  = v => Math.max(0, Math.min(1, v)); // clamp 0–1

  // Sub-scores (0–100): higher-is-better vs lower-is-better per metric
  const subScores = {
    focus:             c(focusRatio            / t.focusRatio)             * 100,
    distraction:       c(1 - distrRatio        / t.distractionRatioCap)    * 100,
    idle:              c(1 - idleRatio         / t.idleRatioCap)            * 100,
    switchBursts:      c(1 - switchBurstsPerHr / t.switchBurstsPerHrCap)   * 100,
    sessionDuration:   c(totalMin              / t.optimalDurationMin)      * 100,
    focusBlocks:       c(focusBlocksPerHr      / t.focusBlocksPerHrTarget)  * 100,
    distractionBlocks: c(1 - distrBlocksPerHr  / t.distractBlocksPerHrCap) * 100,
    idleStreaks:       c(1 - idleStreaksPerHr   / t.idleStreaksPerHrCap)     * 100,
  };

  // Weighted average (weights already sum to 100, so divide by 100)
  const score = Math.round(
    Object.entries(subScores).reduce((acc, [key, sub]) => acc + sub * (w[key] || 0), 0) / 100
  );

  return {
    role,
    score:       Math.max(0, Math.min(100, score)),
    version:     'v1',
    weights:     { ...w },
    factors:     Object.fromEntries(Object.entries(subScores).map(([k, v]) => [k, Math.round(v)])),
    explanation: buildExplanations(subScores, profile.label),
  };
}

// ── Structured Risk Scoring ───────────────────────────────────────────────────

/**
 * computeStructuredRiskScore(session, memory)
 *
 * Combines all deterministic layers into a single manager-facing risk score.
 * Higher = more risk.  0 = no risk, 100 = critical risk.
 *
 * Five signals, each clamped to their declared range, then summed:
 *
 *  A. Role-Based Score     −10 … +25   low role score = high risk
 *  B. Anomaly Signals        0 … +35   anomaly count + high-severity weighting
 *  C. Trend Signals        −10 … +15   worsening trends add risk; improving reduce it
 *  D. Timeline Quality      −8 … +20   focus/distraction/idle ratios, switch bursts
 *  E. Consistency           −4 … +8    high score or duration variance = modest risk bump
 *
 *  Raw = A + B + C + D + E   (theoretical range: −32 … +103)
 *  Score = clamp(raw, 0, 100)
 *
 *  Level thresholds:
 *    0–29   → low
 *    30–54  → moderate
 *    55–74  → high
 *    75–100 → critical
 *
 *  memory may be null (new employees — signals C and E default to 0).
 */
function computeStructuredRiskScore(session, memory) {
  const contributors = [];
  let total = 0;

  // Helper — records a contributor and accumulates the delta.
  function signal(factor, delta, explanation) {
    const contribution = Math.round(delta * 10) / 10;
    if (contribution === 0) return;
    contributors.push({
      factor,
      contribution,
      direction: contribution > 0 ? 'increase' : 'decrease',
      explanation,
    });
    total += contribution;
  }

  // ── A. Role-Based Score (−10 … +25) ──────────────────────────────────────
  //  Formula: A = ((100 − roleScore) × 0.35) − 10
  //  roleScore=100 → A=−10  (reduces risk; strong performer)
  //  roleScore=70  → A=0.5  (neutral)
  //  roleScore=50  → A=7.5  (below average)
  //  roleScore=0   → A=25   (very weak)
  {
    const rs  = session.role_based_score ? session.role_based_score.score : null;
    const A   = rs !== null ? Math.round((100 - rs) * 0.35) - 10 : 0;
    const Ac  = Math.max(-10, Math.min(25, A));
    if (rs !== null) {
      if (Ac > 0) {
        signal('role_based_score', Ac,
          `Role score ${rs} is below average — adds ${Ac} risk point${Ac !== 1 ? 's' : ''}.`);
      } else if (Ac < 0) {
        signal('role_based_score', Ac,
          `Role score ${rs} is strong — reduces risk by ${Math.abs(Ac)} point${Math.abs(Ac) !== 1 ? 's' : ''}.`);
      }
    }
  }

  // ── B. Anomaly Signals (0 … +35) ─────────────────────────────────────────
  //  B = min(anomalyCount × 4, 15) + min(highSeverityCount × 10, 20)
  //  0/0 → 0   |  2/0 → 8   |  3/1 → 12+10=22   |  5/3 → 15+20=35
  {
    const aSum  = session.anomaly_summary;
    const count = aSum ? aSum.anomalyCount       : 0;
    const hsc   = aSum ? aSum.highSeverityCount  : 0;
    const dom   = aSum ? aSum.dominantAnomalyType : null;
    const B     = Math.min(count * 4, 15) + Math.min(hsc * 10, 20);
    if (B > 0) {
      const parts = [];
      if (count > 0) parts.push(`${count} anomal${count !== 1 ? 'ies' : 'y'}`);
      if (hsc   > 0) parts.push(`${hsc} high-severity`);
      signal('anomaly_signals', B,
        `${parts.join(', ')} detected${dom ? ` (dominant: ${dom})` : ''} — adds ${B} risk point${B !== 1 ? 's' : ''}.`);
    }
  }

  // ── C. Trend Signals (−10 … +15) — requires memory ───────────────────────
  //  Each of 5 trends: worsening +3, stable 0, improving −2
  //  All worsening → +15 | all improving → −10 | all stable → 0
  if (memory && memory.trends) {
    const t = memory.trends;
    const DELTA = { improving: -2, stable: 0, worsening: 3 };
    const fields = [
      ['productivityTrend', t.productivityTrend],
      ['idleTrend',         t.idleTrend],
      ['focusTrend',        t.focusTrend],
      ['distractionTrend',  t.distractionTrend],
      ['switchBurstTrend',  t.switchBurstTrend],
    ];
    let C = 0;
    const worsening = [];
    const improving = [];
    for (const [name, dir] of fields) {
      const d = DELTA[dir] || 0;
      C += d;
      if (d > 0) worsening.push(name.replace('Trend', ''));
      if (d < 0) improving.push(name.replace('Trend', ''));
    }
    const Cc = Math.max(-10, Math.min(15, C));
    if (Cc > 0 && worsening.length) {
      signal('trends', Cc,
        `Worsening trends: ${worsening.join(', ')} — adds ${Cc} risk point${Cc !== 1 ? 's' : ''}.`);
    } else if (Cc < 0 && improving.length) {
      signal('trends', Cc,
        `Improving trends: ${improving.join(', ')} — reduces risk by ${Math.abs(Cc)} point${Math.abs(Cc) !== 1 ? 's' : ''}.`);
    }
  }

  // ── D. Timeline Quality (−8 … +20) ────────────────────────────────────────
  //  Focus ratio bands, distraction ratio bands, idle ratio, switch burst count.
  {
    const ts       = session.timeline_summary;
    const totalMin = Math.max(session.total_minutes || 1, 1);
    let D = 0;
    const dParts = [];

    if (ts) {
      const focusPct       = (ts.totalFocusMin       || 0) / totalMin;
      const distractionPct = (ts.totalDistractionMin || 0) / totalMin;
      const idlePct        = (ts.totalIdleMin        || 0) / totalMin;
      const bursts         = ts.switchBurstCount || 0;

      // Focus contribution
      if (focusPct > 0.6) {
        D -= 5; dParts.push(`high focus (${Math.round(focusPct * 100)}%) −5`);
      } else if (focusPct > 0.4) {
        D -= 2; dParts.push(`moderate focus (${Math.round(focusPct * 100)}%) −2`);
      } else if (focusPct < 0.2) {
        D += 10; dParts.push(`very low focus (${Math.round(focusPct * 100)}%) +10`);
      } else if (focusPct < 0.35) {
        D += 5; dParts.push(`low focus (${Math.round(focusPct * 100)}%) +5`);
      }

      // Distraction contribution
      if (distractionPct > 0.35) {
        D += 6; dParts.push(`high distraction (${Math.round(distractionPct * 100)}%) +6`);
      } else if (distractionPct > 0.2) {
        D += 3; dParts.push(`elevated distraction (${Math.round(distractionPct * 100)}%) +3`);
      }

      // Idle contribution
      if (idlePct > 0.4) {
        D += 4; dParts.push(`high idle (${Math.round(idlePct * 100)}%) +4`);
      } else if (idlePct > 0.25) {
        D += 2; dParts.push(`elevated idle (${Math.round(idlePct * 100)}%) +2`);
      }

      // Switch bursts contribution
      if (bursts >= 5) {
        D += 4; dParts.push(`${bursts} switch bursts +4`);
      } else if (bursts >= 3) {
        D += 2; dParts.push(`${bursts} switch bursts +2`);
      }
    }

    const Dc = Math.max(-8, Math.min(20, D));
    if (Dc !== 0 && dParts.length) {
      signal('timeline_quality', Dc,
        `Timeline: ${dParts.join('; ')} — net ${Dc > 0 ? '+' : ''}${Dc} risk point${Math.abs(Dc) !== 1 ? 's' : ''}.`);
    }
  }

  // ── E. Consistency (−4 … +8) — requires memory ────────────────────────────
  //  scoreVariance >400 +8 | >200 +4 | <50 −2
  //  durationVariance >3600 +2 | <400 −2
  if (memory && memory.consistency) {
    const c = memory.consistency;
    let E = 0;
    const eParts = [];

    if (c.scoreVariance > 400) {
      E += 8; eParts.push(`very high score variance (${Math.round(c.scoreVariance)}) +8`);
    } else if (c.scoreVariance > 200) {
      E += 4; eParts.push(`high score variance (${Math.round(c.scoreVariance)}) +4`);
    } else if (c.scoreVariance < 50) {
      E -= 2; eParts.push(`very consistent scores −2`);
    }

    if (c.durationVariance > 3600) {
      E += 2; eParts.push(`erratic session lengths +2`);
    } else if (c.durationVariance < 400) {
      E -= 2; eParts.push(`consistent session lengths −2`);
    }

    const Ec = Math.max(-4, Math.min(8, E));
    if (Ec !== 0 && eParts.length) {
      signal('consistency', Ec,
        `Consistency: ${eParts.join('; ')} — net ${Ec > 0 ? '+' : ''}${Ec} risk point${Math.abs(Ec) !== 1 ? 's' : ''}.`);
    }
  }

  // ── Final score & level ────────────────────────────────────────────────────
  const score = Math.max(0, Math.min(100, Math.round(total)));
  const level =
    score >= 75 ? 'critical' :
    score >= 55 ? 'high'     :
    score >= 30 ? 'moderate' : 'low';

  // ── Summary (2–5 short strings for future UI display) ─────────────────────
  const summary = [];
  summary.push(`Risk level: ${level} (score ${score}/100).`);

  // Top contributors by absolute magnitude
  const sorted = [...contributors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  for (const c of sorted.slice(0, 3)) {
    summary.push(c.explanation);
  }

  if (level === 'critical' || level === 'high') {
    summary.push('Manager review recommended.');
  } else if (level === 'low') {
    summary.push('No immediate action required.');
  }

  return { score, level, version: 'v1', contributors, summary };
}

// ── Anomaly Detection ──────────────────────────────────────────────────────────

/**
 * detectSessionAnomalies(session, memory)
 *
 * Compare a single session against the employee's historical baseline.
 * Returns an array of Anomaly objects (may be empty).
 * Pure deterministic — no AI.
 *
 * Anomaly types:
 *   low_role_score      – role_based_score ≥20% below baseline, ≥10pt gap
 *   high_idle_time      – idle_minutes_estimate ≥40% above baseline, ≥8min gap
 *   low_focus_time      – focus blocks total ≥35% below baseline, ≥8min gap, baseline≥5
 *   high_distraction    – distraction blocks total ≥50% above baseline, ≥5min gap
 *   high_switch_bursts  – switch_bursts count ≥60% above baseline, ≥1 burst above
 *   short_session       – total_minutes ≥40% below baseline, ≥15min gap
 *   long_session        – total_minutes ≥60% above baseline, ≥30min gap
 *   sudden_score_drop   – overall_productivity_score ≥25% below baseline_7, ≥15pt gap (baseline_7 only)
 */
function detectSessionAnomalies(session, memory) {
  if (!memory) return [];

  const anomalies = [];

  // Variance-based leniency: if variance is very high, require a larger deviation
  // before flagging. scoreVariance is population variance of overall_productivity_score.
  const highVariance = memory.consistency && memory.consistency.scoreVariance > 200;
  const lenient = highVariance ? 1.3 : 1.0; // multiply thresholds by 1.3 when volatile

  const baseline = memory.baseline_7 || memory.baseline_14 || memory.baseline_all;
  if (!baseline) return [];

  const b7 = memory.baseline_7;  // may be null

  // Helper: build an anomaly object
  function flag(type, severity, metric, current, base, explanation) {
    const deviationPct = base === 0
      ? (current > 0 ? 100 : 0)
      : Math.round(Math.abs(current - base) / base * 100);
    anomalies.push({ type, severity, metric, currentValue: r1(current), baselineValue: r1(base), deviationPct, explanation });
  }

  // ── 1. low_role_score ────────────────────────────────────────────────────────
  const roleScore = session.role_based_score ? session.role_based_score.score : null;
  if (roleScore !== null && baseline.avgRoleScore > 0) {
    const base = baseline.avgRoleScore;
    const gap  = base - roleScore;
    const pct  = gap / base;
    if (pct >= 0.20 * lenient && gap >= 10) {
      const sev = pct >= 0.40 ? 'high' : pct >= 0.30 ? 'medium' : 'low';
      flag('low_role_score', sev, 'role_based_score.score', roleScore, base,
        `Role score ${roleScore} is ${Math.round(pct * 100)}% below the ${Math.round(base)} baseline.`);
    }
  }

  // ── 2. high_idle_time ────────────────────────────────────────────────────────
  const idleMin = session.idle_minutes_estimate || 0;
  const baseIdle = baseline.avgIdleMin;
  if (baseIdle > 0) {
    const gap = idleMin - baseIdle;
    const pct = gap / baseIdle;
    if (pct >= 0.40 * lenient && gap >= 8) {
      const sev = pct >= 0.80 ? 'high' : pct >= 0.60 ? 'medium' : 'low';
      flag('high_idle_time', sev, 'idle_minutes_estimate', idleMin, baseIdle,
        `Idle time ${r1(idleMin)} min is ${Math.round(pct * 100)}% above the ${r1(baseIdle)} min baseline.`);
    }
  }

  // ── 3. low_focus_time ───────────────────────────────────────────────────────
  const focusMin = session.timeline_summary ? session.timeline_summary.totalFocusMin : 0;
  const baseFocus = baseline.avgFocusMin;
  if (baseFocus >= 5) {
    const gap = baseFocus - focusMin;
    const pct = gap / baseFocus;
    if (pct >= 0.35 * lenient && gap >= 8) {
      const sev = pct >= 0.65 ? 'high' : pct >= 0.50 ? 'medium' : 'low';
      flag('low_focus_time', sev, 'timeline_summary.totalFocusMin', focusMin, baseFocus,
        `Focus time ${r1(focusMin)} min is ${Math.round(pct * 100)}% below the ${r1(baseFocus)} min baseline.`);
    }
  }

  // ── 4. high_distraction ─────────────────────────────────────────────────────
  const distrMin = session.timeline_summary ? session.timeline_summary.totalDistractionMin : 0;
  const baseDistr = baseline.avgDistractionMin;
  if (baseDistr > 0) {
    const gap = distrMin - baseDistr;
    const pct = gap / baseDistr;
    if (pct >= 0.50 * lenient && gap >= 5) {
      const sev = pct >= 1.0 ? 'high' : pct >= 0.75 ? 'medium' : 'low';
      flag('high_distraction', sev, 'timeline_summary.totalDistractionMin', distrMin, baseDistr,
        `Distraction time ${r1(distrMin)} min is ${Math.round(pct * 100)}% above the ${r1(baseDistr)} min baseline.`);
    }
  }

  // ── 5. high_switch_bursts ────────────────────────────────────────────────────
  const bursts = session.timeline_summary ? session.timeline_summary.switchBurstCount : 0;
  const baseBursts = baseline.avgSwitchBurstCount;
  if (baseBursts > 0) {
    const gap = bursts - baseBursts;
    const pct = gap / baseBursts;
    if (pct >= 0.60 * lenient && gap >= 1) {
      const sev = pct >= 1.5 ? 'high' : pct >= 1.0 ? 'medium' : 'low';
      flag('high_switch_bursts', sev, 'timeline_summary.switchBurstCount', bursts, baseBursts,
        `Context switch bursts (${bursts}) are ${Math.round(pct * 100)}% above the ${r1(baseBursts)} baseline.`);
    }
  } else if (baseBursts === 0 && bursts >= 3) {
    // Baseline was zero but session has notable bursts
    flag('high_switch_bursts', 'medium', 'timeline_summary.switchBurstCount', bursts, 0,
      `Context switch bursts (${bursts}) detected; baseline is 0.`);
  }

  // ── 6. short_session ─────────────────────────────────────────────────────────
  const totalMin = session.total_minutes || 0;
  const baseDur  = baseline.avgSessionDurationMin;
  if (baseDur > 0) {
    const gap = baseDur - totalMin;
    const pct = gap / baseDur;
    if (pct >= 0.40 * lenient && gap >= 15) {
      const sev = pct >= 0.65 ? 'high' : pct >= 0.55 ? 'medium' : 'low';
      flag('short_session', sev, 'total_minutes', totalMin, baseDur,
        `Session duration ${r1(totalMin)} min is ${Math.round(pct * 100)}% below the ${r1(baseDur)} min baseline.`);
    }
  }

  // ── 7. long_session ──────────────────────────────────────────────────────────
  if (baseDur > 0) {
    const gap = totalMin - baseDur;
    const pct = gap / baseDur;
    if (pct >= 0.60 * lenient && gap >= 30) {
      const sev = pct >= 1.2 ? 'high' : pct >= 0.90 ? 'medium' : 'low';
      flag('long_session', sev, 'total_minutes', totalMin, baseDur,
        `Session duration ${r1(totalMin)} min is ${Math.round(pct * 100)}% above the ${r1(baseDur)} min baseline.`);
    }
  }

  // ── 8. sudden_score_drop (baseline_7 only) ───────────────────────────────────
  if (b7 && b7.avgProductivityScore > 0) {
    const score = session.overall_productivity_score || 0;
    const base7 = b7.avgProductivityScore;
    const gap   = base7 - score;
    const pct   = gap / base7;
    if (pct >= 0.25 * lenient && gap >= 15) {
      const sev = pct >= 0.45 ? 'high' : pct >= 0.35 ? 'medium' : 'low';
      flag('sudden_score_drop', sev, 'overall_productivity_score', score, base7,
        `Productivity score ${score} is ${Math.round(pct * 100)}% below recent 7-session avg of ${Math.round(base7)}.`);
    }
  }

  return anomalies;
}

/**
 * Build an anomaly_summary from an anomaly array.
 */
function buildAnomalySummary(anomalies) {
  if (!anomalies || anomalies.length === 0) {
    return { anomalyCount: 0, highSeverityCount: 0, dominantAnomalyType: null };
  }
  const highSeverityCount = anomalies.filter(a => a.severity === 'high').length;
  // Dominant = most frequent type; if tie, pick first occurrence
  const freq = {};
  for (const a of anomalies) if (a && a.type) freq[a.type] = (freq[a.type] || 0) + 1;
  const dominantAnomalyType = Object.entries(freq).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  return { anomalyCount: anomalies.length, highSeverityCount, dominantAnomalyType };
}

/**
 * annotateWithAnomalies(sessions)
 *
 * Groups sessions by employee name, computes each employee's memory,
 * then annotates every session in-place with session_anomalies and anomaly_summary.
 * Returns the same sessions array (mutated).
 */
function annotateWithAnomalies(sessions) {
  if (!sessions || sessions.length === 0) return sessions;

  // Group by employee key (userName preferred, fallback to role)
  const byEmployee = {};
  for (const s of sessions) {
    const key = s.userName || s.role || 'Unknown';
    if (!byEmployee[key]) byEmployee[key] = [];
    byEmployee[key].push(s);
  }

  // For each employee group, compute leave-one-out memory then annotate.
  // Each session's anomaly and risk scores are computed against a baseline
  // that excludes that session itself, preventing a session from partially
  // neutralizing its own anomaly signal.
  for (const empSessions of Object.values(byEmployee)) {
    if (empSessions.length < 2) {
      for (const s of empSessions) {
        s.session_anomalies     = [];
        s.anomaly_summary       = { anomalyCount: 0, highSeverityCount: 0, dominantAnomalyType: null };
        s.structured_risk_score = computeStructuredRiskScore(s, null);
      }
      continue;
    }

    for (const s of empSessions) {
      // Leave-one-out: exclude the current session from its own baseline.
      const others  = empSessions.filter(x => x.id !== s.id);
      const memory  = others.length >= 1 ? computeEmployeeMemory(others) : null;
      const anomalies         = detectSessionAnomalies(s, memory);
      s.session_anomalies     = anomalies;
      s.anomaly_summary       = buildAnomalySummary(anomalies);
      s.structured_risk_score = computeStructuredRiskScore(s, memory);
    }
  }

  return sessions;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// POST /api/sync/file
// Receives a raw binary file body (JSON, JSONL, TXT, or PNG/JPG screenshot)
// and writes it to BASE/<X-Sync-Path>.
//
// Integrity-aware behavior (prevents permanent corruption lock-in):
//   - File does not exist      → create with atomic write (201 created)
//   - File exists, binary      → skip (200 exists)
//   - File exists, JSON/text   → check integrity:
//       * unparseable JSON      → overwrite with atomic write (200 overwritten)
//       * existing < 90% size of incoming → overwrite (indicates partial write)
//       * valid and full        → skip (200 exists)
//
// limit: 100 MB — screenshots from high-DPI displays can exceed 50 MB.
app.post('/api/sync/file', express.raw({ type: () => true, limit: '100mb' }), (req, res) => {
  const relativePath = req.headers['x-sync-path'];
  if (!relativePath) return res.status(400).json({ error: 'Missing X-Sync-Path header' });

  const dest = path.join(BASE, relativePath.split('/').join(path.sep));
  if (!path.resolve(dest).startsWith(path.resolve(BASE)))
    return res.status(403).json({ error: 'Forbidden path' });

  if (!fs.existsSync(dest)) {
    // New file — create atomically.
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      atomicWriteFile(dest, req.body);
      return res.status(201).json({ status: 'created' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // File exists — decide whether to keep or overwrite based on integrity.
  const ext = path.extname(dest).toLowerCase();
  const isTextFile = ['.json', '.jsonl', '.txt'].includes(ext);

  if (isTextFile) {
    let overwrite = false;
    const existingRaw = safeRead(dest);

    if (ext === '.json') {
      // Corrupt JSON → overwrite.
      try { JSON.parse(existingRaw); } catch { overwrite = true; }
    }

    if (!overwrite) {
      // Existing file significantly shorter than incoming → likely a partial write.
      const existingBytes = Buffer.byteLength(existingRaw, 'utf8');
      const incomingBytes = req.body.length;
      if (incomingBytes > 0 && existingBytes < incomingBytes * 0.9) {
        overwrite = true;
      }
    }

    if (overwrite) {
      try {
        atomicWriteFile(dest, req.body);
        return res.status(200).json({ status: 'overwritten' });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  }

  // File exists and appears valid (or is binary) — skip.
  return res.status(200).json({ status: 'exists' });
});

// GET /api/sessions
app.get('/api/sessions', (req, res) => {
  const pairs    = discoverSessions();
  const sessions = [];

  for (const { date, stamp, masterPath } of pairs) {
    const s = buildSession(date, stamp, masterPath);
    if (s) sessions.push(s);
  }

  annotateWithAnomalies(sessions);
  sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(sessions);
});

// GET /api/employee/:name  –  sessions for one employee only
app.get('/api/employee/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const pairs = discoverSessions();
  const sessions = [];

  for (const { date, stamp, masterPath } of pairs) {
    const s = buildSession(date, stamp, masterPath);
    // Match by userName (multi-user systems) or by role (single-user, role-based grouping)
    if (s && (s.userName === name || s.role === name)) sessions.push(s);
  }

  annotateWithAnomalies(sessions);
  sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(sessions);
});

// GET /api/sessions/:id   (id = <date>_<stamp>, e.g. 2026-01-08_11-40-51)
app.get('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const date  = id.slice(0, 10);
  const stamp = id.slice(11);
  const s = buildSession(date, stamp);
  if (!s) return res.status(404).json({ error: 'Session not found' });

  // Load all sessions for this employee so anomaly detection has a baseline
  const empKey = s.userName || s.role || null;
  if (empKey) {
    const empSessions = [];
    for (const { date: d, stamp: st, masterPath: mp } of discoverSessions()) {
      const other = buildSession(d, st, mp);
      if (other && (other.userName === empKey || other.role === empKey)) empSessions.push(other);
    }
    if (empSessions.length >= 2) {
      annotateWithAnomalies(empSessions);
      // Copy anomaly + risk fields onto our target session
      const match = empSessions.find(x => x.id === s.id);
      if (match) {
        s.session_anomalies    = match.session_anomalies;
        s.anomaly_summary      = match.anomaly_summary;
        s.structured_risk_score = match.structured_risk_score;
      }
    }
  }
  if (!s.session_anomalies) {
    s.session_anomalies = [];
    s.anomaly_summary   = { anomalyCount: 0, highSeverityCount: 0, dominantAnomalyType: null };
  }
  if (!s.structured_risk_score) {
    s.structured_risk_score = computeStructuredRiskScore(s, null);
  }

  res.json(s);
});

// GET /api/heatmap  –  daily average scores
app.get('/api/heatmap', (req, res) => {
  const dateMap = {};

  for (const { date, stamp, masterPath } of discoverSessions()) {
    const s = buildSession(date, stamp, masterPath);
    if (!s) continue;
    if (!dateMap[date]) dateMap[date] = [];
    dateMap[date].push(s.overall_productivity_score);
  }

  const result = Object.entries(dateMap).map(([date, scores]) => ({
    date,
    avg_score:     Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    session_count: scores.length,
  }));

  res.json(result);
});

// GET /api/anomalies  –  all anomalous sessions across all employees (anomalyCount > 0)
app.get('/api/anomalies', (req, res) => {
  const pairs    = discoverSessions();
  const sessions = [];
  for (const { date, stamp, masterPath } of pairs) {
    const s = buildSession(date, stamp, masterPath);
    if (s) sessions.push(s);
  }
  annotateWithAnomalies(sessions);
  const flagged = sessions.filter(s => s.anomaly_summary && s.anomaly_summary.anomalyCount > 0);
  flagged.sort((a, b) => (b.anomaly_summary.highSeverityCount - a.anomaly_summary.highSeverityCount)
    || (new Date(b.created_at) - new Date(a.created_at)));
  res.json(flagged);
});

// Serve screenshot by absolute path (encoded as base64 query param or direct path)
// GET /screenshots?path=<url-encoded-absolute-path>
app.get('/screenshots', (req, res) => {
  const absPath = req.query.path;
  if (!absPath) return res.status(400).send('Missing path');

  // Security: restrict to data folder only
  const resolved = path.resolve(absPath);
  const dataRoot = path.resolve(BASE);
  if (!resolved.startsWith(dataRoot)) return res.status(403).send('Forbidden');
  if (!exists(resolved))             return res.status(404).send('Not found');

  res.sendFile(resolved);
});

// GET /api/memory/:name  –  historical memory for one employee
app.get('/api/memory/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const pairs = discoverSessions();
  const sessions = [];

  for (const { date, stamp, masterPath } of pairs) {
    const s = buildSession(date, stamp, masterPath);
    if (s && (s.userName === name || s.role === name)) sessions.push(s);
  }

  if (!sessions.length) {
    return res.status(404).json({ error: 'No sessions found for employee', employee_name: name });
  }

  const memory = computeEmployeeMemory(sessions);
  res.json({ employee_name: name, ...memory });
});

// GET /api/memory  –  historical memory for all employees (grouped)
app.get('/api/memory', (req, res) => {
  const pairs = discoverSessions();
  const byEmployee = {};

  for (const { date, stamp, masterPath } of pairs) {
    const s = buildSession(date, stamp, masterPath);
    if (!s) continue;
    const key = s.userName || 'Unknown';
    if (!byEmployee[key]) byEmployee[key] = [];
    byEmployee[key].push(s);
  }

  const result = Object.entries(byEmployee).map(([name, empSessions]) => ({
    employee_name: name,
    ...computeEmployeeMemory(empSessions),
  }));

  res.json(result);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: discoverSessions().length, auth: Boolean(API_TOKEN) });
});

app.listen(PORT, '127.0.0.1', () => {
  // Bound to loopback only — Caddy terminates TLS and proxies in front of it.
  console.log(`\n  TELER API  →  http://127.0.0.1:${PORT}`);
  console.log(`  Data root  →  ${BASE}`);
  console.log(`  Auth       →  ${API_TOKEN ? 'enabled' : 'DISABLED (no API_TOKEN set)'}`);
  console.log(`  Origins    →  ${ALLOWED_ORIGINS.join(', ')}\n`);
});
