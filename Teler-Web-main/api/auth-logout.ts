import { backendJson, clearedSessionCookie, noStoreJson, readSessionToken } from './_auth.js';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    }
    const token = readSessionToken(request);
    if (token) {
      try {
        await backendJson('/api/auth/logout', { method: 'POST', body: '{}' }, token);
      } catch (error) {
        console.error('TELER logout backend error', error);
      }
    }
    return noStoreJson({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
  },
};