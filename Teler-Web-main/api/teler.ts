import { noStoreJson, readSessionToken, unauthorized } from './_auth.js';

const ALLOWED_PATHS = [
  /^\/api\/sessions$/,
  /^\/api\/sessions\/.+$/,
  /^\/api\/employee\/.+$/,
  /^\/api\/heatmap$/,
  /^\/api\/anomalies$/,
  /^\/api\/memory$/,
  /^\/api\/memory\/.+$/,
  /^\/screenshots$/,

  // Read-only modular backend routes. The browser never receives Oracle tokens.
  /^\/api\/v1\/health$/,
  /^\/api\/v1\/companies$/,
  /^\/api\/v1\/companies\/[^/]+\/employees$/,
  /^\/api\/v1\/companies\/[^/]+\/devices$/,
  /^\/api\/v1\/employees\/[^/]+$/,
  /^\/api\/v1\/devices\/[^/]+$/,
  /^\/api\/v1\/sessions$/,
  /^\/api\/v1\/sessions\/[^/]+$/,
  /^\/api\/v1\/screenshots\/[^/]+\/content$/,
  /^\/api\/v1\/analytics\/company\/[^/]+\/daily$/,
  /^\/api\/v1\/analytics\/employee\/[^/]+\/trends$/,
  /^\/api\/v1\/alerts$/,
  /^\/api\/v1\/alerts\/[^/]+$/,
  /^\/api\/v1\/alert-rules$/,
  /^\/api\/v1\/tasks$/,
  /^\/api\/v1\/tasks\/[^/]+$/,
  /^\/api\/v1\/reports$/,
  /^\/api\/v1\/reports\/[^/]+$/,
  /^\/api\/v1\/settings\/retention$/,

  // User-owned tracking state. These routes use the authenticated user's backend
  // bearer session rather than the shared Oracle API token.
  /^\/api\/v1\/tracking-sessions$/,
  /^\/api\/v1\/tracking-sessions\/current$/,
  /^\/api\/v1\/tracking-sessions\/start$/,
  /^\/api\/v1\/tracking-sessions\/[^/]+\/(pause|resume|stop)$/,
];

type JsonRecord = Record<string, unknown>;

function allowedTarget(rawTarget: string): URL | null {
  try {
    const sentinelOrigin = 'https://teler.invalid';
    const target = new URL(rawTarget, sentinelOrigin);
    if (target.origin !== sentinelOrigin) return null;
    if (!ALLOWED_PATHS.some((pattern) => pattern.test(target.pathname))) return null;
    return target;
  } catch {
    return null;
  }
}

function isUserOwnedTarget(pathname: string): boolean {
  return /^\/api\/v1\/(?:tracking-sessions|screenshots)(?:\/|$)/.test(pathname);
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function clampMinutes(value: number, total: number | null): number {
  const normalized = Math.max(0, value);
  return total === null ? normalized : Math.min(total, normalized);
}

function reconstructSwitches(session: JsonRecord): JsonRecord[] {
  const existing = Array.isArray(session.app_switches)
    ? session.app_switches.filter(isRecord)
    : [];
  if (existing.length) return existing;

  const timeline = Array.isArray(session.timeline_segments)
    ? session.timeline_segments.filter(isRecord)
    : [];
  const ordered = [...timeline].sort(
    (a, b) => (finiteNumber(a.startMin, a.start_min) ?? 0) - (finiteNumber(b.startMin, b.start_min) ?? 0),
  );
  const switches: JsonRecord[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const previousApp = String(ordered[i - 1].app ?? '').trim();
    const currentApp = String(ordered[i].app ?? '').trim();
    if (!previousApp || !currentApp || previousApp === currentApp) continue;
    switches.push({
      atMin: finiteNumber(ordered[i].startMin, ordered[i].start_min) ?? 0,
      from: previousApp,
      to: currentApp,
    });
  }
  return switches;
}

function reconstructTopApps(session: JsonRecord): JsonRecord[] {
  const evidence = isRecord(session.evidence) ? session.evidence : {};
  const existing = Array.isArray(evidence.top_apps_minutes)
    ? evidence.top_apps_minutes.filter(isRecord)
    : [];
  if (existing.length) return existing;

  const timeline = Array.isArray(session.timeline_segments)
    ? session.timeline_segments.filter(isRecord)
    : [];
  const totals = new Map<string, number>();
  for (const segment of timeline) {
    const app = String(segment.app ?? '').trim();
    if (!app) continue;
    const start = finiteNumber(segment.startMin, segment.start_min) ?? 0;
    const end = finiteNumber(segment.endMin, segment.end_min);
    const duration = finiteNumber(segment.durationMin, segment.duration_minutes)
      ?? (end === null ? 0 : Math.max(0, end - start));
    if (duration > 0) totals.set(app, (totals.get(app) ?? 0) + duration);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([app, minutes]) => ({ app, minutes: Math.round(minutes * 100) / 100 }));
}

function normalizeSession(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const session: JsonRecord = { ...value };
  const analytics = isRecord(session.analytics) ? { ...session.analytics } : {};
  const evidence = isRecord(session.evidence) ? { ...session.evidence } : {};

  const total = finiteNumber(session.total_minutes, analytics.total_minutes);
  let active = finiteNumber(
    session.active_minutes_estimate,
    analytics.active_minutes_estimate,
    analytics.active_minutes,
  );
  let idle = finiteNumber(
    session.idle_minutes_estimate,
    analytics.idle_minutes_estimate,
    analytics.idle_minutes,
  );

  if (total !== null && active !== null) {
    active = clampMinutes(active, total);
    idle = Math.max(0, total - active);
  } else if (total !== null && idle !== null) {
    idle = clampMinutes(idle, total);
    active = Math.max(0, total - idle);
  }

  if (active !== null) session.active_minutes_estimate = active;
  if (idle !== null) session.idle_minutes_estimate = idle;

  if (active !== null) {
    analytics.active_minutes_estimate = active;
    analytics.active_minutes = active;
  }
  if (idle !== null) {
    analytics.idle_minutes_estimate = idle;
    analytics.idle_minutes = idle;
    if (total && total > 0) analytics.idle_percentage = Math.round((idle / total) * 1000) / 10;
  }
  if (total !== null) analytics.total_minutes = total;

  const appSwitches = reconstructSwitches(session);
  session.app_switches = appSwitches;
  session.app_switch_count = appSwitches.length;
  analytics.app_switch_count = appSwitches.length;
  analytics.switch_count = appSwitches.length;

  const topAppsMinutes = reconstructTopApps(session);
  if (topAppsMinutes.length) {
    evidence.top_apps_minutes = topAppsMinutes;
    if (!Array.isArray(session.top_apps) || session.top_apps.length === 0) {
      session.top_apps = topAppsMinutes
        .map((entry) => String(entry.app ?? '').trim())
        .filter(Boolean);
    }
  }

  session.analytics = analytics;
  session.evidence = evidence;
  return session;
}

function normalizePayload(payload: unknown, pathname: string): unknown {
  if (!/^\/api\/(sessions|employee\/)/.test(pathname)) return payload;
  if (Array.isArray(payload)) return payload.map(normalizeSession);
  if (isRecord(payload) && Array.isArray(payload.sessions)) {
    return { ...payload, sessions: payload.sessions.map(normalizeSession) };
  }
  return normalizeSession(payload);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    const target = allowedTarget(requestUrl.searchParams.get('target') ?? '');
    if (!target) return noStoreJson({ error: 'API route is not allowed' }, 400);

    const userOwnedTarget = isUserOwnedTarget(target.pathname);
    const methodAllowed = request.method === 'GET'
      || request.method === 'HEAD'
      || (userOwnedTarget && request.method === 'POST');
    if (!methodAllowed) {
      return noStoreJson({ error: 'Method not allowed' }, 405, {
        Allow: userOwnedTarget ? 'GET, HEAD, POST' : 'GET, HEAD',
      });
    }

    try {
      const userToken = readSessionToken(request);
      if (!userToken) return unauthorized();

      const apiBase = process.env.TELER_API_BASE?.trim().replace(/\/+$/, '');
      const apiToken = process.env.TELER_API_TOKEN?.trim();
      if (!apiBase || (!userOwnedTarget && !apiToken)) {
        console.error('TELER proxy configuration error: required backend configuration is missing');
        return noStoreJson({ error: 'Oracle API connection is not configured in Vercel' }, 503);
      }

      const upstreamUrl = new URL(`${target.pathname}${target.search}`, `${apiBase}/`);
      const headers = new Headers();
      headers.set('Accept', request.headers.get('accept') ?? 'application/json');
      headers.set('Authorization', `Bearer ${userOwnedTarget ? userToken : apiToken}`);
      if (request.method === 'POST') headers.set('Content-Type', request.headers.get('content-type') ?? 'application/json');
      const upstreamBody = request.method === 'POST' ? await request.text() : undefined;
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: upstreamBody,
        redirect: 'error',
      });

      const responseHeaders = new Headers();
      for (const name of ['content-type', 'cache-control', 'etag', 'last-modified']) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      if (!responseHeaders.has('cache-control')) responseHeaders.set('Cache-Control', 'private, no-store');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');

      if (request.method === 'HEAD' || !upstream.ok || !upstream.headers.get('content-type')?.includes('application/json')) {
        return new Response(request.method === 'HEAD' ? null : upstream.body, {
          status: upstream.status,
          headers: responseHeaders,
        });
      }

      const payload = await upstream.json();
      const normalized = normalizePayload(payload, target.pathname);
      responseHeaders.set('Content-Type', 'application/json; charset=utf-8');
      responseHeaders.delete('content-length');
      responseHeaders.delete('etag');
      responseHeaders.delete('last-modified');

      return new Response(JSON.stringify(normalized), {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error('TELER proxy error', error);
      return noStoreJson({ error: 'TELER API is unavailable' }, 502);
    }
  },
};
