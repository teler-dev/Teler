import { backendJson, noStoreJson, sessionCookie } from './_auth.js';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return noStoreJson({ error: 'Invalid request' }, 400);
    }

    const input = body as { username?: unknown; email?: unknown; password?: unknown };
    const email = typeof input.email === 'string'
      ? input.email.trim()
      : typeof input.username === 'string' ? input.username.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!email || !password || email.length > 254 || password.length > 256) {
      return noStoreJson({ error: 'Invalid email or password' }, 401);
    }

    try {
      const { response, body: upstream } = await backendJson('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        return noStoreJson({ error: typeof upstream.error === 'string' ? upstream.error : 'Unable to sign in' }, response.status);
      }
      const token = typeof upstream.token === 'string' ? upstream.token : '';
      const user = upstream.user && typeof upstream.user === 'object'
        ? upstream.user as Record<string, unknown>
        : {};
      if (!token) return noStoreJson({ error: 'Authentication server returned no session token' }, 502);
      const username = typeof user.displayName === 'string' ? user.displayName : email;
      return noStoreJson(
        { username, email: typeof user.email === 'string' ? user.email : email, user },
        200,
        { 'Set-Cookie': sessionCookie(token) },
      );
    } catch (error) {
      console.error('TELER login backend error', error);
      return noStoreJson({ error: 'Authentication service is unavailable' }, 503);
    }
  },
};