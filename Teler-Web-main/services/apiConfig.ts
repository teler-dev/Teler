/**
 * Central configuration for the TELER backend API.
 *
 * Both values come from Vite env vars, injected at build time:
 *   VITE_API_BASE   e.g. https://130-61-12-34.sslip.io   (no trailing slash)
 *   VITE_API_TOKEN  the shared bearer token the server expects
 *
 * Locally, with no .env.local present, these fall back to the dev server on
 * 127.0.0.1:7001 with no token — which matches a backend started without
 * API_TOKEN set.
 *
 * Note on the token: it is bundled into the client JavaScript, so it is not a
 * secret from anyone who opens devtools. It stops drive-by access to the API,
 * nothing more. Real per-user auth is the follow-up.
 */

const rawBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:7001';

/** Base URL with any trailing slash removed, so `${API_BASE}/api/x` is always well-formed. */
export const API_BASE = rawBase.replace(/\/+$/, '');

export const API_TOKEN = ((import.meta.env.VITE_API_TOKEN as string | undefined) ?? '').trim();

/** Authorization header for fetch calls; empty object when no token is configured. */
export function authHeaders(): Record<string, string> {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {};
}

/** Build an API URL from a root-relative path, e.g. apiUrl('/api/sessions'). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * URL for a screenshot at an absolute server-side path.
 *
 * <img src> cannot send an Authorization header, so the token rides in the
 * query string here — the server accepts it either way.
 */
export function screenshotUrl(absolutePath: string): string {
  const params = new URLSearchParams({ path: absolutePath });
  if (API_TOKEN) params.set('token', API_TOKEN);
  return `${API_BASE}/screenshots?${params.toString()}`;
}

/** fetch() against the API with the bearer token applied. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
}
