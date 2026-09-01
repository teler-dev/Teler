/**
 * Central configuration for the TELER backend API.
 *
 * Production requests go through the same-origin /api/teler Vercel Function.
 * That function validates the HttpOnly dashboard session and adds the Oracle
 * bearer token server-side, so no infrastructure credential is shipped in the
 * browser bundle or screenshot URL.
 *
 * For local UI development only, VITE_API_BASE can point directly at an API
 * started without API_TOKEN. Use `vercel dev` to exercise production auth and
 * proxy behavior locally.
 */

const localDirectBase = import.meta.env.DEV
  ? ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').trim().replace(/\/+$/, '')
  : '';

/** Retained for existing call sites; production authentication is cookie-based. */
export function authHeaders(): Record<string, string> {
  return {};
}

/** Build an API URL from a root-relative path, e.g. apiUrl('/api/sessions'). */
export function apiUrl(path: string): string {
  const target = path.startsWith('/') ? path : `/${path}`;
  if (localDirectBase) return `${localDirectBase}${target}`;
  return `/api/teler?target=${encodeURIComponent(target)}`;
}

/**
 * URL for a screenshot at an absolute server-side path.
 *
 * The browser automatically sends the same-origin HttpOnly session cookie.
 */
export function screenshotUrl(absolutePath: string): string {
  const params = new URLSearchParams({ path: absolutePath });
  return apiUrl(`/screenshots?${params.toString()}`);
}

/** fetch() against the authenticated same-origin API proxy. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: localDirectBase ? 'omit' : 'same-origin',
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('teler:unauthorized'));
  }
  return response;
}
