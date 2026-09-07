import type { Plugin } from 'vite';

/** Run the same Fetch handlers as Vercel during local development. */
export function localApi(buildId: string): Plugin {
  const routes = new Set(['auth-login', 'auth-me', 'auth-logout', 'teler', 'ai']);
  return {
    name: 'teler-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost:3000');
        if (url.pathname === '/version.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ buildId }));
          return;
        }
        const route = url.pathname.replace(/^\/api\//, '');
        if (!url.pathname.startsWith('/api/') || !routes.has(route)) return next();
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 1024 * 1024) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request too large' }));
              return;
            }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          }
          const request = new Request(url, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : Buffer.concat(chunks),
          });
          const module = await server.ssrLoadModule(`/api/${route}.ts`);
          const response: Response = await module.default.fetch(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(`Local API: ${String(error)}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Local API request failed' }));
        }
      });
    },
  };
}
