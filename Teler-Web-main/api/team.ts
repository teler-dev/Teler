/**
 * Admin team management for the dashboard.
 *
 * GET  /api/team  → list employees in the signed-in owner/admin's workspace
 * POST /api/team  → create a new employee in that workspace
 *
 * Both calls forward the dashboard's HttpOnly session token as the bearer to the
 * Oracle backend, which enforces owner/admin authorization. The browser never
 * receives the shared Oracle API token.
 */

import { backendJson, noStoreJson, readSessionToken } from './_auth.js';

export default {
  async fetch(request: Request): Promise<Response> {
    const token = readSessionToken(request);
    if (!token) return noStoreJson({ error: 'Unauthorized' }, 401);

    if (request.method === 'GET') {
      try {
        const { response, body } = await backendJson('/api/auth/employees', { method: 'GET' }, token);
        return noStoreJson(body, response.status);
      } catch (error) {
        console.error('TELER team list error', error);
        return noStoreJson({ error: 'Team service is unavailable' }, 503);
      }
    }

    if (request.method === 'POST') {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return noStoreJson({ error: 'Invalid request' }, 400);
      }

      const input = payload as { displayName?: unknown; email?: unknown; password?: unknown; jobRole?: unknown };
      const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
      const email = typeof input.email === 'string' ? input.email.trim() : '';
      const password = typeof input.password === 'string' ? input.password : '';
      const jobRole = typeof input.jobRole === 'string' && input.jobRole.trim() ? input.jobRole.trim() : 'general';
      if (!displayName || !email || !password) {
        return noStoreJson({ error: 'Name, email and password are required' }, 400);
      }
      if (email.length > 254 || password.length > 256) {
        return noStoreJson({ error: 'Name, email and password are required' }, 400);
      }

      try {
        const { response, body } = await backendJson(
          '/api/auth/employees',
          { method: 'POST', body: JSON.stringify({ displayName, email, password, jobRole }) },
          token,
        );
        return noStoreJson(body, response.status);
      } catch (error) {
        console.error('TELER team create error', error);
        return noStoreJson({ error: 'Team service is unavailable' }, 503);
      }
    }

    return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
  },
};
