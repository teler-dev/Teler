import { clearedSessionCookie, noStoreJson } from './_auth.js';

export default {
  fetch(request: Request): Response {
    if (request.method !== 'POST') {
      return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    }

    return noStoreJson(
      { ok: true },
      200,
      { 'Set-Cookie': clearedSessionCookie() },
    );
  },
};
