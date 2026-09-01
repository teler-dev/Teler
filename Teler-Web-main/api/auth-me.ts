import { noStoreJson, readSession, unauthorized } from './_auth.js';

export default {
  fetch(request: Request): Response {
    if (request.method !== 'GET') {
      return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
    }

    try {
      const session = readSession(request);
      return session ? noStoreJson({ username: session.sub }) : unauthorized();
    } catch (error) {
      console.error('TELER session configuration error', error);
      return noStoreJson({ error: 'Authentication is not configured' }, 503);
    }
  },
};
