import { noStoreJson, readSession, unauthorized } from './_auth.js';

const ALLOWED_PATHS = [
  /^\/api\/sessions$/,
  /^\/api\/sessions\/.+$/,
  /^\/api\/employee\/.+$/,
  /^\/api\/heatmap$/,
  /^\/api\/anomalies$/,
  /^\/api\/memory$/,
  /^\/api\/memory\/.+$/,
  /^\/screenshots$/,
];

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

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD' });
    }

    try {
      if (!readSession(request)) return unauthorized();

      const requestUrl = new URL(request.url);
      const target = allowedTarget(requestUrl.searchParams.get('target') ?? '');
      if (!target) return noStoreJson({ error: 'API route is not allowed' }, 400);

      const apiBase = process.env.TELER_API_BASE?.trim().replace(/\/+$/, '');
      const apiToken = process.env.TELER_API_TOKEN?.trim();
      if (!apiBase || !apiToken) throw new Error('TELER_API_BASE or TELER_API_TOKEN is missing');

      const upstreamUrl = new URL(`${target.pathname}${target.search}`, `${apiBase}/`);
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: {
          Accept: request.headers.get('accept') ?? '*/*',
          Authorization: `Bearer ${apiToken}`,
        },
        redirect: 'error',
      });

      const headers = new Headers();
      for (const name of ['content-type', 'cache-control', 'etag', 'last-modified']) {
        const value = upstream.headers.get(name);
        if (value) headers.set(name, value);
      }
      if (!headers.has('cache-control')) headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');

      return new Response(request.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        headers,
      });
    } catch (error) {
      console.error('TELER proxy error', error);
      return noStoreJson({ error: 'TELER API is unavailable' }, 502);
    }
  },
};
