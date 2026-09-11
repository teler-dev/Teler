/**
 * Stable public relay for the TELER desktop client.
 *
 * It is deliberately narrower than the browser dashboard proxy: only the
 * desktop authentication and user-owned tracking endpoints are accepted, and
 * the desktop's existing bearer token is forwarded unchanged to Oracle.
 */

const ALLOWED_PATHS = [
  /^\/api\/auth\/(?:signup|login|logout|me)$/,
  /^\/api\/v1\/health$/,
  /^\/api\/v1\/tracking-sessions$/,
  /^\/api\/v1\/tracking-sessions\/current$/,
  /^\/api\/v1\/tracking-sessions\/start$/,
  /^\/api\/v1\/tracking-sessions\/[^/]+\/(?:pause|resume|stop|screenshots)$/,
];

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function validTarget(rawTarget: string): URL | null {
  try {
    const origin = 'https://teler.invalid';
    const target = new URL(rawTarget, origin);
    if (target.origin !== origin || !ALLOWED_PATHS.some((pattern) => pattern.test(target.pathname))) return null;
    return target;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const target = validTarget(new URL(request.url).searchParams.get('target') ?? '');
    if (!target) return noStoreJson({ error: 'Desktop API route is not allowed' }, 400);
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
      return noStoreJson({ error: 'Method not allowed' }, 405);
    }

    const apiBase = process.env.TELER_API_BASE?.trim().replace(/\/+$/, '');
    if (!apiBase) return noStoreJson({ error: 'Oracle API connection is not configured' }, 503);

    try {
      const headers = new Headers();
      headers.set('Accept', request.headers.get('accept') ?? 'application/json');
      const authorization = request.headers.get('authorization');
      if (authorization) headers.set('Authorization', authorization);
      const contentType = request.headers.get('content-type');
      if (contentType) headers.set('Content-Type', contentType);
      for (const name of ['x-client-event-id', 'x-captured-at', 'x-active-window', 'x-active-app']) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }

      const body = request.method === 'POST' ? await request.arrayBuffer() : undefined;
      const upstream = await fetch(new URL(`${target.pathname}${target.search}`, `${apiBase}/`), {
        method: request.method,
        headers,
        body,
        redirect: 'error',
      });
      const responseHeaders = new Headers();
      for (const name of ['content-type', 'cache-control', 'etag', 'last-modified']) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      responseHeaders.set('Cache-Control', 'private, no-store');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch {
      return noStoreJson({ error: 'TELER desktop relay is unavailable' }, 502);
    }
  },
};
