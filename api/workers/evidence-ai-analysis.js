'use strict';

const fs = require('fs/promises');
const path = require('path');
const { getPool, withTransaction } = require('../db');

const DATA_ROOT = path.resolve(process.env.DATA_ROOT || '/opt/teler/data');
const MODEL = process.env.AI_EVIDENCE_MODEL || 'gemini-2.5-flash-lite';
const RELAY_URL = process.env.AI_EVIDENCE_RELAY_URL || 'https://teler-pi.vercel.app/api/ai-evidence';
const BATCH_MINUTES = 15;
const MAX_UNIQUE_SHOTS = Math.min(5, Math.max(1, Number(process.env.AI_EVIDENCE_MAX_SCREENSHOTS) || 4));
const MAX_IMAGE_BYTES = 900 * 1024;

async function relay(payload) {
  const response = await fetch(RELAY_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.API_TOKEN || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, model: MODEL }), signal: AbortSignal.timeout(40_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error || `AI relay returned HTTP ${response.status}`));
  return body;
}

function hammingDistance(left, right) {
  if (!/^[a-f0-9]{16,64}$/i.test(left || '') || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let value = parseInt(left[index], 16) ^ parseInt(right[index], 16);
    while (value) { distance += value & 1; value >>>= 1; }
  }
  return distance;
}

function groupVisualEvidence(shots) {
  const groups = [];
  for (const shot of shots) {
    const group = groups.find(item => shot.visual_hash && item.visual_hash && hammingDistance(shot.visual_hash, item.visual_hash) <= 4);
    if (group) { group.last_captured_at = shot.captured_at; group.repeat_count += 1; }
    else groups.push({ ...shot, first_captured_at: shot.captured_at, last_captured_at: shot.captured_at, repeat_count: 1 });
  }
  return groups;
}

const evidenceMimeType = storagePath => /\.jpe?g$/i.test(storagePath) ? 'image/jpeg' : 'image/png';
const safeList = (value, max = 5) => Array.isArray(value) ? value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, max) : [];

async function refreshDaily(client, context, reportDate) {
  const reports = await client.query(`select status,summary,evidence_coverage from app.session_ai_reports where organization_id=$1 and employee_id=$2 and report_date=$3 order by created_at`, [context.organization_id, context.employee_id, reportDate]);
  const ready = reports.rows.filter(row => row.status === 'ready');
  const coverage = reports.rows.reduce((acc, row) => { acc.captured += Number(row.evidence_coverage?.captured || 0); acc.analysed += Number(row.evidence_coverage?.analysed || 0); return acc; }, { captured: 0, analysed: 0 });
  const summary = ready.length ? ready.map(row => String(row.summary || '')).filter(Boolean).join(' ').slice(0, 1800) : 'Insufficient evidence for an AI daily report.';
  await client.query(`insert into app.daily_ai_reports (organization_id,employee_id,report_date,status,summary,session_count,evidence_coverage) values ($1,$2,$3,$4,$5,$6,$7::jsonb)
    on conflict (organization_id,employee_id,report_date) do update set status=excluded.status,summary=excluded.summary,session_count=excluded.session_count,evidence_coverage=excluded.evidence_coverage,updated_at=now()`, [context.organization_id, context.employee_id, reportDate, ready.length ? 'ready' : 'insufficient_evidence', summary, reports.rowCount, JSON.stringify(coverage)]);
}

async function markReportFailed(context, reportDate, error) {
  await withTransaction(async client => {
    await client.query(`update app.session_ai_reports set status='failed',error_message=$4,updated_at=now() where organization_id=$1 and session_id=$2 and employee_id=$3`, [context.organization_id, context.session_id, context.employee_id, String(error.message || error).slice(0, 1000)]);
    await refreshDaily(client, context, reportDate);
  });
}

async function queueNextBatch(pool, context, windowEnd) {
  const nextEnd = new Date(new Date(windowEnd).getTime() + BATCH_MINUTES * 60_000);
  const runAfter = nextEnd > new Date() ? nextEnd : new Date();
  await pool.query(`insert into app.background_jobs (job_type,priority,payload,dedupe_key,run_after) values ('EvidenceAiAnalysis',2,$1,$2,$3) on conflict (dedupe_key) do nothing`, [{ ...context, window_end: nextEnd.toISOString(), final: false }, `evidence-ai:${context.session_id}:${nextEnd.toISOString()}`, runAfter]);
}

async function processEvidenceAiAnalysis(payload) {
  const pool = getPool(); if (!pool) throw new Error('DATABASE_URL is not configured');
  const session = await pool.query(`select id,organization_id,employee_id,started_at,tracking_status,total_duration_seconds,total_paused_seconds from app.work_sessions where organization_id=$1 and id=$2`, [payload.organization_id, payload.session_id]);
  if (!session.rowCount) throw new Error('Session not found');
  const row = session.rows[0]; const context = { organization_id: row.organization_id, employee_id: row.employee_id, session_id: row.id };
  const reportDate = new Date(row.started_at).toISOString().slice(0, 10); const windowEnd = new Date(payload.window_end || Date.now());
  await pool.query(`insert into app.session_ai_reports (organization_id,employee_id,session_id,report_date,model,status) values ($1,$2,$3,$4,$5,'processing') on conflict (organization_id,session_id) do update set status='processing',model=excluded.model,error_message=null,updated_at=now()`, [context.organization_id, context.employee_id, context.session_id, reportDate, MODEL]);
  try {
    const candidates = await pool.query(`select s.id,s.storage_path,s.captured_at,s.active_app,s.active_window,s.visual_hash,s.browser_tabs from app.screenshots s left join app.screenshot_ai_findings f on f.organization_id=s.organization_id and f.screenshot_id=s.id where s.organization_id=$1 and s.session_id=$2 and f.id is null ${payload.final ? '' : 'and s.captured_at < $3'} order by s.captured_at asc`, payload.final ? [context.organization_id, context.session_id] : [context.organization_id, context.session_id, windowEnd]);
    const uniqueShots = groupVisualEvidence(candidates.rows).slice(0, MAX_UNIQUE_SHOTS); const findings = [];
    for (const shot of uniqueShots) {
      const filePath = path.resolve(DATA_ROOT, shot.storage_path);
      if (!filePath.startsWith(`${DATA_ROOT}${path.sep}`)) continue;
      const image = await fs.readFile(filePath); if (image.length > MAX_IMAGE_BYTES) continue;
      const timeRange = { from: shot.first_captured_at, to: shot.last_captured_at, repeated_captures: shot.repeat_count };
      const result = await relay({ mode: 'screenshot', image_base64: image.toString('base64'), image_mime_type: evidenceMimeType(shot.storage_path), metadata: { captured_at: shot.captured_at, time_range: timeRange, active_app: shot.active_app, active_window: shot.active_window, browser_tabs: Array.isArray(shot.browser_tabs) ? shot.browser_tabs.slice(0, 8) : [] } });
      const finding = { screenshot_id: shot.id, summary: String(result.summary || 'Insufficient evidence.').slice(0, 500), confidence: Number(result.confidence) || null, observed_signals: safeList(result.observed_signals), time_range: timeRange };
      findings.push(finding);
      await pool.query(`insert into app.screenshot_ai_findings (organization_id,session_id,screenshot_id,model,status,summary,confidence,observed_signals) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict (organization_id,screenshot_id) do update set model=excluded.model,status=excluded.status,summary=excluded.summary,confidence=excluded.confidence,observed_signals=excluded.observed_signals,created_at=now()`, [context.organization_id, context.session_id, shot.id, MODEL, finding.confidence ? 'ready' : 'insufficient_evidence', finding.summary, finding.confidence, JSON.stringify([...finding.observed_signals, `Evidence range: ${new Date(timeRange.from).toISOString()} – ${new Date(timeRange.to).toISOString()}`])]);
    }
    const metrics = await pool.query(`select productivity_score,active_minutes,idle_minutes,deep_work_minutes,app_switch_count from app.session_metrics where organization_id=$1 and session_id=$2`, [context.organization_id, context.session_id]);
    const allFindings = await pool.query(`select summary,confidence,observed_signals from app.screenshot_ai_findings where organization_id=$1 and session_id=$2 and status='ready' order by created_at asc limit 20`, [context.organization_id, context.session_id]);
    const report = allFindings.rowCount ? await relay({ mode: 'session', telemetry: { duration_seconds: row.total_duration_seconds, paused_seconds: row.total_paused_seconds, metrics: metrics.rows[0] || {} }, findings: allFindings.rows }) : null;
    const highlights = safeList(report?.highlights, 5);
    const coverage = { captured: candidates.rowCount, unique: uniqueShots.length, duplicates_skipped: Math.max(0, candidates.rowCount - uniqueShots.length), analysed: findings.length, window_end: windowEnd.toISOString() };
    await withTransaction(async client => {
      await client.query(`update app.session_ai_reports set status=$4,summary=$5,highlights=$6::jsonb,confidence=$7,evidence_coverage=$8::jsonb,error_message=null,updated_at=now() where organization_id=$1 and session_id=$2 and employee_id=$3`, [context.organization_id, context.session_id, context.employee_id, report ? 'ready' : 'insufficient_evidence', report ? String(report.summary || '').slice(0, 700) : 'No unique, analysable screenshots were available for this batch.', JSON.stringify(highlights), report ? Number(report.confidence) || null : null, JSON.stringify(coverage)]);
      await refreshDaily(client, context, reportDate);
    });
    if (!payload.final && ['running', 'paused'].includes(row.tracking_status)) await queueNextBatch(pool, context, windowEnd);
    return { session_id: context.session_id, screenshots: coverage, highlights: highlights.length, status: report ? 'ready' : 'insufficient_evidence' };
  } catch (error) {
    await markReportFailed(context, reportDate, error).catch(() => {}); throw error;
  }
}

module.exports = { processEvidenceAiAnalysis, hammingDistance, groupVisualEvidence };
