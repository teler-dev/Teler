const COOKIE_NAME = '__Host-teler_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type JsonRecord = Record<string, unknown>;

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 1) return [];
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        return [[key, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

export function backendApiBase(): string {
  const value = process.env.TELER_API_BASE?.trim().replace(/\/+$/, '');
  if (!value) throw new Error('Missing required environment variable: TELER_API_BASE');
  return value;
}

export function readSessionToken(request: Request): string | null {
  return parseCookies(request.headers.get('cookie'))[COOKIE_NAME] || null;
}

/** Compatibility helper retained for existing proxy call sites. */
export function readSession(request: Request): { token: string } | null {
  const token = readSessionToken(request);
  return token ? { token } : null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function noStoreJson(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function unauthorized(): Response {
  return noStoreJson({ error: 'Unauthorized' }, 401);
}

export async function backendJson(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<{ response: Response; body: JsonRecord }> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${backendApiBase()}${path}`, {
    ...init,
    headers,
    redirect: 'error',
  });
  const body = await response.json().catch(() => ({})) as JsonRecord;
  return { response, body };
}