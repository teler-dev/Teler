'use strict';

const fs = require('fs/promises');
const path = require('path');
const { getPool, withTransaction } = require('../db');

const DATA_ROOT = path.resolve(process.env.DATA_ROOT || '/opt/teler/data');
const MODEL = process.env.AI_EVIDENCE_MODEL || 'openai/gpt-4o-mini';
const RELAY_URL = process.env.AI_EVIDENCE_RELAY_URL || 'https://teler-pi.vercel.app/api/ai-evidence';
const MAX_SHOTS = Math.min(5, Math.max(1, Number(process.env.AI_EVIDENCE_MAX_SCREENSHOTS) || 3));

async function relay(payload) {
  const response = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.API_TOKEN || ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, model: MODEL }), signal: AbortSignal.timeout(40_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error || `AI relay returned HTTP ${response.status}`));
  return body;
}

function safeEvidence(value) { return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 8) : []; }

async function refreshDaily(client, context, reportDate) {
  const reports = await client.query(`select status,summary,evidence_coverage from app.session_ai_reports
    where organization_id=$1 and employee_id=$2 and report_date=$3 order by created_at`, [context.organization_id, context.employee_id, reportDate]);
  const ready = reports.rows.filter(row => row.status === 'ready');
  const coverage = reports.rows.reduce((acc, row) => {
    acc.captured += Number(row.evidence_coverage?.captured || 0); acc.analysed += Number(row.evidence_coverage?.analysed || 0); return acc;
  }, { captured: 0, analysed: 0 });
  const summary = ready.length
    ? ready.map(row => String(row.summary || '')).filter(Boolean).join(' ').slice(0, 6000)
    : 'Insufficient evidence for an AI daily report.';
  await client.query(`insert into app.daily_ai_reports (organization_id,employee_id,report_date,status,summary,session_count,evidence_coverage)
    values ($1,$2,$3,$4,$5,$6,$7::jsonb)
    on conflict (organization_id,employee_id,report_date) do update set status=excluded.status,summary=excluded.summary,
      session_count=excluded.session_count,evidence_coverage=excluded.evidence_coverage,updated_at=now()`,
  [context.organization_id, context.employee_id, reportDate, ready.length ? 'ready' : 'insufficient_evidence', summary, reports.rowCount, JSON.stringify(coverage)]);
}

async function markReportFailed(context, reportDate, error) {
  await withTransaction(async client => {
    await client.query(`update app.session_ai_reports set status='failed',error_message=$4,updated_at=now()
      where organization_id=$1 and session_id=$2 and employee_id=$3`, [
      context.organization_id, context.session_id, context.employee_id, String(error.message || error).slice(0, 2000),
    ]);
    await refreshDaily(client, context, reportDate);
  });
}

async function processEvidenceAiAnalysis(payload) {
  const pool = getPool(); if (!pool) throw new Error('DATABASE_URL is not configured');
  const session = await pool.query(`select id,organization_id,employee_id,started_at,total_duration_seconds,total_paused_seconds
    from app.work_sessions where organization_id=$1 and id=$2`, [payload.organization_id, payload.session_id]);
  if (!session.rowCount) throw new Error('Session not found');
  const row = session.rows[0]; const context = { organization_id: row.organization_id, employee_id: row.employee_id, session_id: row.id };
  const reportDate = new Date(row.started_at).toISOString().slice(0, 10);
  await pool.query(`insert into app.session_ai_reports (organization_id,employee_id,session_id,report_date,model,status)
    values ($1,$2,$3,$4,$5,'processing') on conflict (organization_id,session_id)
    do update set status='processing',model=excluded.model,error_message=null,updated_at=now()`, [context.organization_id, context.employee_id, context.session_id, reportDate, MODEL]);
  try {
  const shots = await pool.query(`select id,storage_path,captured_at,active_app,active_window from app.screenshots
    where organization_id=$1 and session_id=$2 order by captured_at asc limit $3`, [context.organization_id, context.session_id, MAX_SHOTS]);
  const findings = [];
  for (const shot of shots.rows) {
    const filePath = path.resolve(DATA_ROOT, shot.storage_path);
    if (!filePath.startsWith(`${DATA_ROOT}${path.sep}`)) continue;
    const image = await fs.readFile(filePath);
    if (image.length > 4 * 1024 * 1024) continue;
    const result = await relay({ mode: 'screenshot', image_base64: image.toString('base64'), metadata: { captured_at: shot.captured_at, active_app: shot.active_app, active_window: shot.active_window } });
    const finding = { screenshot_id: shot.id, summary: String(result.summary || 'Insufficient evidence.').slice(0, 2000), confidence: Number(result.confidence) || null, observed_signals: safeEvidence(result.observed_signals) };
    findings.push(finding);
    await pool.query(`insert into app.screenshot_ai_findings (organization_id,session_id,screenshot_id,model,status,summary,confidence,observed_signals)
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict (organization_id,screenshot_id) do update set
      model=excluded.model,status=excluded.status,summary=excluded.summary,confidence=excluded.confidence,observed_signals=excluded.observed_signals,created_at=now()`,
    [context.organization_id, context.session_id, shot.id, MODEL, finding.confidence ? 'ready' : 'insufficient_evidence', finding.summary, finding.confidence, JSON.stringify(finding.observed_signals)]);
  }
  const metrics = await pool.query(`select productivity_score,active_minutes,idle_minutes,deep_work_minutes,app_switch_count from app.session_metrics where organization_id=$1 and session_id=$2`, [context.organization_id, context.session_id]);
  const coverage = { captured: shots.rowCount, analysed: findings.length };
  const report = findings.length ? await relay({ mode: 'session', telemetry: { duration_seconds: row.total_duration_seconds, paused_seconds: row.total_paused_seconds, metrics: metrics.rows[0] || {} }, findings }) : null;
  await withTransaction(async client => {
    await client.query(`update app.session_ai_reports set status=$4,summary=$5,confidence=$6,evidence_coverage=$7::jsonb,error_message=null,updated_at=now()
      where organization_id=$1 and session_id=$2 and employee_id=$3`, [context.organization_id, context.session_id, context.employee_id,
      report ? 'ready' : 'insufficient_evidence', report ? String(report.summary || '').slice(0, 6000) : 'No analysable screenshots were available for this session.', report ? Number(report.confidence) || null : null, JSON.stringify(coverage)]);
    await refreshDaily(client, context, reportDate);
  });
  return { session_id: context.session_id, screenshots: coverage, status: report ? 'ready' : 'insufficient_evidence' };
  } catch (error) {
    await markReportFailed(context, reportDate, error).catch(() => {});
    throw error;
  }
}
module.exports = { processEvidenceAiAnalysis };
