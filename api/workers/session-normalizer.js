'use strict';

const fs = require('fs');
const { getPool, withTransaction } = require('../db');
const { normalizeTelemetry } = require('../lib/telemetry-normalizer');

function severityFor(metric, value) {
  if (metric === 'idle_seconds') return value >= 3600 ? 'critical' : value >= 1800 ? 'high' : 'medium';
  if (metric === 'productivity_score') return value <= 30 ? 'critical' : value <= 50 ? 'high' : 'medium';
  return 'medium';
}

async function upsertAlert(client, context, alert) {
  await client.query(`
    insert into app.alerts (organization_id, employee_id, session_id, rule_id, alert_type, severity, metric, threshold, actual_value, description)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict (organization_id, session_id, alert_type) where session_id is not null and status <> 'dismissed'
    do update set rule_id=excluded.rule_id,severity=excluded.severity,metric=excluded.metric,threshold=excluded.threshold,
                  actual_value=excluded.actual_value,description=excluded.description,updated_at=now(),
                  status=case when app.alerts.status='resolved' then app.alerts.status else 'open' end
  `, [context.organization_id, context.employee_id, context.session_id, alert.rule_id || null, alert.type, alert.severity,
      alert.metric, alert.threshold ?? null, alert.actual ?? null, alert.description]);
}

function metricValue(metrics, metric) {
  const map = {
    idle_seconds: metrics.idleSeconds,
    focus_seconds: metrics.focusSeconds,
    distraction_seconds: metrics.distractionSeconds,
    app_switches: metrics.appSwitches,
    productivity_score: metrics.productivityScore,
    key_count: metrics.keyCount,
    click_count: metrics.clickCount,
    total_seconds: metrics.totalSeconds,
  };
  return map[metric];
}

function conditionMatches(actual, operator, expected) {
  if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
  const value = Number(expected);
  if (!Number.isFinite(value)) return false;
  if (operator === '>') return actual > value;
  if (operator === '>=') return actual >= value;
  if (operator === '<') return actual < value;
  if (operator === '<=') return actual <= value;
  if (operator === '==') return actual === value;
  return false;
}

async function persistAlerts(client, context, metrics) {
  const candidates = [];
  if (metrics.totalSeconds >= 10 * 60 && metrics.idleSeconds / metrics.totalSeconds >= 0.35) {
    candidates.push({ type: 'high_idle', metric: 'idle_seconds', threshold: Math.round(metrics.totalSeconds * 0.35), actual: metrics.idleSeconds, severity: severityFor('idle_seconds', metrics.idleSeconds), description: 'Idle time exceeded 35% of the normalized session.' });
  }
  if (metrics.totalSeconds >= 10 * 60 && metrics.productivityScore <= 50) {
    candidates.push({ type: 'low_productivity', metric: 'productivity_score', threshold: 50, actual: metrics.productivityScore, severity: severityFor('productivity_score', metrics.productivityScore), description: 'Normalized productivity score is at or below 50/100.' });
  }
  if (metrics.appSwitches >= 20) {
    candidates.push({ type: 'high_context_switch', metric: 'app_switches', threshold: 20, actual: metrics.appSwitches, severity: metrics.appSwitches >= 40 ? 'high' : 'medium', description: 'High app-switch volume detected in the session.' });
  }

  const rules = await client.query(`select id,name,rule_type,condition,severity from app.alert_rules where organization_id=$1 and enabled=true`, [context.organization_id]);
  for (const rule of rules.rows) {
    const condition = rule.condition || {};
    const metric = String(condition.metric || rule.rule_type || '');
    const actual = metricValue(metrics, metric);
    const operator = String(condition.operator || '>');
    const expected = condition.value ?? condition.threshold;
    if (!conditionMatches(actual, operator, expected)) continue;
    candidates.push({
      rule_id: rule.id,
      type: `rule:${rule.id}`,
      metric,
      threshold: Number(expected),
      actual,
      severity: rule.severity,
      description: `${rule.name}: ${metric} ${operator} ${expected} (actual ${actual}).`,
    });
  }

  for (const alert of candidates) await upsertAlert(client, context, alert);
}

async function persistScreenshots(client, context, screenshots) {
  await client.query('delete from app.screenshots where organization_id=$1 and session_id=$2', [context.organization_id, context.session_id]);
  for (const screenshot of Array.isArray(screenshots) ? screenshots : []) {
    if (!screenshot || !screenshot.storage_path) continue;
    await client.query(`insert into app.screenshots
      (organization_id,session_id,storage_path,thumbnail_path,ocr_text,active_window,active_app,captured_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (organization_id,storage_path) do update set session_id=excluded.session_id,thumbnail_path=excluded.thumbnail_path,
        ocr_text=excluded.ocr_text,active_window=excluded.active_window,active_app=excluded.active_app,captured_at=excluded.captured_at`,
      [context.organization_id, context.session_id, String(screenshot.storage_path).slice(0,2000), screenshot.thumbnail_path || null,
       screenshot.ocr_text || null, screenshot.active_window || null, screenshot.active_app || null, screenshot.timestamp || null]);
  }
}

async function processSessionNormalization(payload) {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not configured');
  if (!payload.raw_path || !fs.existsSync(payload.raw_path)) throw new Error('Structured ingest archive is missing');
  const raw = JSON.parse(fs.readFileSync(payload.raw_path, 'utf8'));
  const normalized = normalizeTelemetry(raw);

  await withTransaction(async client => {
    const context = { organization_id: payload.organization_id, employee_id: payload.employee_id, session_id: payload.session_id };
    await client.query('delete from app.app_usage where organization_id=$1 and session_id=$2', [context.organization_id, context.session_id]);
    await client.query('delete from app.session_metrics_minute where organization_id=$1 and session_id=$2', [context.organization_id, context.session_id]);
    await client.query('delete from app.focus_blocks where organization_id=$1 and session_id=$2', [context.organization_id, context.session_id]);

    for (const segment of normalized.segments) {
      await client.query(`insert into app.app_usage
        (organization_id,session_id,app_name,category,started_at,ended_at,duration_seconds,key_count,click_count)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [context.organization_id, context.session_id, segment.app, segment.category, segment.started_at, segment.ended_at, segment.duration_seconds, segment.key_count, segment.click_count]);
    }
    for (const row of normalized.minuteMetrics) {
      await client.query(`insert into app.session_metrics_minute
        (organization_id,session_id,employee_id,minute_timestamp,key_count,click_count,app_switches,idle_seconds,focus_seconds,distraction_seconds)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [context.organization_id, context.session_id, context.employee_id, row.minute_timestamp, row.key_count, row.click_count, row.app_switches, row.idle_seconds, row.focus_seconds, row.distraction_seconds]);
    }
    for (const block of normalized.blocks) {
      await client.query(`insert into app.focus_blocks
        (organization_id,session_id,employee_id,block_type,app_name,started_at,ended_at,duration_seconds)
        values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [context.organization_id, context.session_id, context.employee_id, block.block_type, block.app_name, block.started_at, block.ended_at, block.duration_seconds]);
    }
    await persistScreenshots(client, context, raw.screenshots);

    const metrics = normalized.metrics;
    await client.query(`insert into app.session_metrics
      (organization_id,session_id,productivity_score,active_minutes,idle_minutes,deep_work_minutes,key_count,mouse_clicks,
       app_switch_count,idle_seconds,focus_seconds,distraction_seconds,calculated_version)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'v2')
      on conflict (organization_id,session_id) do update set
       productivity_score=excluded.productivity_score,active_minutes=excluded.active_minutes,idle_minutes=excluded.idle_minutes,
       deep_work_minutes=excluded.deep_work_minutes,key_count=excluded.key_count,mouse_clicks=excluded.mouse_clicks,
       app_switch_count=excluded.app_switch_count,idle_seconds=excluded.idle_seconds,focus_seconds=excluded.focus_seconds,
       distraction_seconds=excluded.distraction_seconds,calculated_version='v2',calculated_at=now()`,
      [context.organization_id, context.session_id, metrics.productivityScore, metrics.activeSeconds / 60, metrics.idleSeconds / 60,
       metrics.focusSeconds / 60, metrics.keyCount, metrics.clickCount, metrics.appSwitches, metrics.idleSeconds, metrics.focusSeconds, metrics.distractionSeconds]);

    const sessionRow = await client.query(`select started_at,ended_at from app.work_sessions where organization_id=$1 and id=$2`, [context.organization_id, context.session_id]);
    const started = sessionRow.rows[0]?.started_at || raw.started_at || new Date();
    const ended = sessionRow.rows[0]?.ended_at || raw.ended_at || started;
    const durationSeconds = Math.max(0, Math.round((new Date(ended) - new Date(started)) / 1000)) || metrics.totalSeconds;
    await client.query(`update app.work_sessions set status='complete',total_minutes=$3,updated_at=now() where organization_id=$1 and id=$2`, [context.organization_id, context.session_id, durationSeconds / 60]);

    const metricDate = new Date(started).toISOString().slice(0, 10);
    await client.query(`insert into app.session_metrics_daily
      (organization_id,employee_id,metric_date,session_count,total_duration_seconds,key_count,click_count,app_switches,idle_seconds,focus_seconds,distraction_seconds,avg_productivity_score)
      select $1,$2,$3::date,count(*),coalesce(sum(round(ws.total_minutes*60)),0),coalesce(sum(sm.key_count),0),
             coalesce(sum(sm.mouse_clicks),0),coalesce(sum(sm.app_switch_count),0),coalesce(sum(sm.idle_seconds),0),
             coalesce(sum(sm.focus_seconds),0),coalesce(sum(sm.distraction_seconds),0),avg(sm.productivity_score)
      from app.work_sessions ws join app.session_metrics sm on sm.organization_id=ws.organization_id and sm.session_id=ws.id
      where ws.organization_id=$1 and ws.employee_id=$2 and ws.started_at::date=$3::date
      on conflict (organization_id,employee_id,metric_date) do update set
        session_count=excluded.session_count,total_duration_seconds=excluded.total_duration_seconds,key_count=excluded.key_count,
        click_count=excluded.click_count,app_switches=excluded.app_switches,idle_seconds=excluded.idle_seconds,
        focus_seconds=excluded.focus_seconds,distraction_seconds=excluded.distraction_seconds,
        avg_productivity_score=excluded.avg_productivity_score,updated_at=now()`, [context.organization_id, context.employee_id, metricDate]);

    await persistAlerts(client, context, metrics);
  });

  return {
    session_id: payload.session_id,
    metrics: normalized.metrics,
    minute_rows: normalized.minuteMetrics.length,
    app_segments: normalized.segments.length,
    blocks: normalized.blocks.length,
    screenshots: Array.isArray(raw.screenshots) ? raw.screenshots.length : 0,
  };
}

module.exports = { processSessionNormalization, conditionMatches, metricValue };