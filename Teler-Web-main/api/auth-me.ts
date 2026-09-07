import { backendJson, clearedSessionCookie, noStoreJson, readSessionToken, unauthorized } from './_auth.js';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
      return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
    }
    const token = readSessionToken(request);
    if (!token) return unauthorized();
    try {
      const { response, body } = await backendJson('/api/auth/me', { method: 'GET' }, token);
      if (response.status === 401) {
        return noStoreJson({ error: 'Unauthorized' }, 401, { 'Set-Cookie': clearedSessionCookie() });
      }
      if (!response.ok) return noStoreJson({ error: typeof body.error === 'string' ? body.error : 'Unable to load account' }, response.status);
      const user = body.user && typeof body.user === 'object' ? body.user as Record<string, unknown> : {};
      const username = typeof user.displayName === 'string'
        ? user.displayName
        : typeof user.email === 'string' ? user.email : 'TELER User';
      return noStoreJson({ username, email: user.email, user });
    } catch (error) {
      console.error('TELER session backend error', error);
      return noStoreJson({ error: 'Authentication service is unavailable' }, 503);
    }
  },
};