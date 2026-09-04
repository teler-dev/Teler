'use strict';

const { classifyWindow } = require('../classifier');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const asDate = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
const minuteFloor = date => new Date(Math.floor(date.getTime() / 60_000) * 60_000);

function appName(title) {
  const text = String(title || '').trim();
  if (!text) return 'Unknown';
  const lower = text.toLowerCase();
  if (lower.includes('visual studio code') || lower.includes('code')) return 'VS Code';
  if (lower.includes('chrome')) return 'Chrome';
  if (lower.includes('edge')) return 'Edge';
  if (lower.includes('firefox')) return 'Firefox';
  if (lower.includes('slack')) return 'Slack';
  if (lower.includes('teams')) return 'Teams';
  if (lower.includes('outlook')) return 'Outlook';
  const parts = text.split(' - ');
  return parts[parts.length - 1].slice(0, 120);
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map(event => ({
      timestamp: asDate(event.timestamp),
      window_title: String(event.window_title || event.active_window || ''),
      active_url: String(event.active_url || event.url || ''),
      keys: Number(event.keys) || 0,
      clicks: Number(event.clicks) || 0,
      idle_seconds: Number(event.idle_seconds) || 0,
    }))
    .filter(event => event.timestamp)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function buildSegments(events) {
  if (!events.length) return [];
  const runs = [];
  for (const event of events) {
    const last = runs[runs.length - 1];
    const key = `${event.window_title}\n${event.active_url}`;
    if (last && last.key === key) {
      last.last = event;
      continue;
    }
    runs.push({ key, first: event, last: event });
  }
  return runs.map((run, index) => {
    const next = runs[index + 1]?.first.timestamp;
    const start = run.first.timestamp;
    const end = next || new Date(run.last.timestamp.getTime() + 1000);
    const seconds = clamp(Math.round((end - start) / 1000), 1, 24 * 60 * 60);
    const classification = run.first.idle_seconds > 0
      ? { type: 'idle', classifiedBy: 'idle' }
      : classifyWindow(run.first.window_title, run.first.active_url);
    return {
      app: appName(run.first.window_title),
      category: classification.type || 'neutral',
      classified_by: classification.classifiedBy || 'fallback',
      started_at: start,
      ended_at: end,
      duration_seconds: seconds,
      key_count: Math.max(0, run.last.keys - run.first.keys),
      click_count: Math.max(0, run.last.clicks - run.first.clicks),
    };
  });
}

function buildMinuteMetrics(events, segments) {
  const buckets = new Map();
  const ensure = (date) => {
    const key = minuteFloor(date).toISOString();
    if (!buckets.has(key)) buckets.set(key, { minute_timestamp: key, key_count: 0, click_count: 0, app_switches: 0, idle_seconds: 0, focus_seconds: 0, distraction_seconds: 0 });
    return buckets.get(key);
  };
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const bucket = ensure(event.timestamp);
    const previous = events[i - 1];
    if (previous) {
      bucket.key_count += Math.max(0, event.keys - previous.keys);
      bucket.click_count += Math.max(0, event.clicks - previous.clicks);
      if (appName(event.window_title) !== appName(previous.window_title)) bucket.app_switches += 1;
    }
  }
  for (const segment of segments) {
    let cursor = new Date(segment.started_at);
    const end = new Date(segment.ended_at);
    while (cursor < end) {
      const bucketStart = minuteFloor(cursor);
      const bucketEnd = new Date(bucketStart.getTime() + 60_000);
      const seconds = Math.max(0, Math.round((Math.min(end, bucketEnd) - cursor) / 1000));
      const bucket = ensure(cursor);
      if (segment.category === 'idle') bucket.idle_seconds += seconds;
      else if (segment.category === 'productive') bucket.focus_seconds += seconds;
      else if (segment.category === 'distraction') bucket.distraction_seconds += seconds;
      cursor = bucketEnd;
    }
  }
  return [...buckets.values()].sort((a, b) => a.minute_timestamp.localeCompare(b.minute_timestamp));
}

function buildBlocks(segments) {
  const definitions = { productive: ['focus', 20 * 60], distraction: ['distraction', 10 * 60], idle: ['idle', 5 * 60] };
  const blocks = [];
  for (const [category, [blockType, minimum]] of Object.entries(definitions)) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const duration = run.reduce((sum, segment) => sum + segment.duration_seconds, 0);
      if (duration >= minimum) {
        const apps = new Map();
        run.forEach(segment => apps.set(segment.app, (apps.get(segment.app) || 0) + segment.duration_seconds));
        const app = [...apps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        blocks.push({ block_type: blockType, app_name: app, started_at: run[0].started_at, ended_at: run[run.length - 1].ended_at, duration_seconds: duration });
      }
      run = [];
    };
    for (const segment of segments) segment.category === category ? run.push(segment) : flush();
    flush();
  }
  return blocks;
}

function summarize(events, segments, minutes, summary = {}) {
  const keyCount = Number(summary.key_count) || (events[events.length - 1]?.keys || 0);
  const clickCount = Number(summary.mouse_clicks) || (events[events.length - 1]?.clicks || 0);
  const appSwitches = minutes.reduce((sum, row) => sum + row.app_switches, 0);
  const idleSeconds = segments.filter(s => s.category === 'idle').reduce((sum, s) => sum + s.duration_seconds, 0);
  const focusSeconds = segments.filter(s => s.category === 'productive').reduce((sum, s) => sum + s.duration_seconds, 0);
  const distractionSeconds = segments.filter(s => s.category === 'distraction').reduce((sum, s) => sum + s.duration_seconds, 0);
  const totalSeconds = segments.reduce((sum, s) => sum + s.duration_seconds, 0);
  const activeSeconds = Math.max(0, totalSeconds - idleSeconds);
  const productivityScore = totalSeconds ? Math.round(clamp(((focusSeconds - distractionSeconds * 0.5) / totalSeconds) * 100, 0, 100)) : 0;
  return { keyCount, clickCount, appSwitches, idleSeconds, focusSeconds, distractionSeconds, totalSeconds, activeSeconds, productivityScore };
}

function normalizeTelemetry(payload) {
  const events = normalizeEvents(payload.events);
  const segments = buildSegments(events);
  const minuteMetrics = buildMinuteMetrics(events, segments);
  const blocks = buildBlocks(segments);
  const metrics = summarize(events, segments, minuteMetrics, payload.summary || {});
  return { events, segments, minuteMetrics, blocks, metrics };
}

module.exports = { normalizeEvents, buildSegments, buildMinuteMetrics, buildBlocks, normalizeTelemetry };