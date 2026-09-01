import {
  createSessionToken,
  noStoreJson,
  sessionCookie,
  verifyCredentials,
} from './_auth.js';

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

    const username = typeof (body as { username?: unknown })?.username === 'string'
      ? (body as { username: string }).username.trim()
      : '';
    const password = typeof (body as { password?: unknown })?.password === 'string'
      ? (body as { password: string }).password
      : '';

    if (!username || !password || username.length > 128 || password.length > 256) {
      return noStoreJson({ error: 'Invalid username or password' }, 401);
    }

    try {
      if (!verifyCredentials(username, password)) {
        return noStoreJson({ error: 'Invalid username or password' }, 401);
      }

      return noStoreJson(
        { username },
        200,
        { 'Set-Cookie': sessionCookie(createSessionToken(username)) },
      );
    } catch (error) {
      console.error('TELER login configuration error', error);
      return noStoreJson({ error: 'Authentication is not configured' }, 503);
    }
  },
};
