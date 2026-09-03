export type AppRoute =
  | { kind: 'landing'; path: '/' }
  | { kind: 'login'; path: '/login' }
  | { kind: 'dashboard'; path: '/dashboard' }
  | { kind: 'employees'; path: '/employees' }
  | { kind: 'employee'; path: string; employeeId: string }
  | { kind: 'session'; path: string; employeeId: string; sessionId: string }
  | { kind: 'alerts'; path: '/alerts' }
  | { kind: 'alert'; path: string; alertId: string }
  | { kind: 'analytics'; path: '/analytics' }
  | { kind: 'compare'; path: '/analytics/compare' }
  | { kind: 'reports'; path: '/reports' }
  | { kind: 'custom-dashboard'; path: '/dashboards/customize' }
  | { kind: 'saved-views'; path: '/saved-views' }
  | { kind: 'ai'; path: '/ai' }
  | { kind: 'ai-settings'; path: '/settings/ai' }
  | { kind: 'notifications'; path: '/settings/notifications' }
  | { kind: 'security-admin'; path: '/admin/security' }
  | { kind: 'marketing'; path: string; view: string };

const MARKETING_PATHS: Record<string, string> = {
  '/how-it-works': 'how-it-works', '/privacy': 'privacy', '/terms': 'terms', '/gdpr': 'gdpr',
  '/integrations': 'integrations', '/security': 'security', '/about': 'about', '/careers': 'careers', '/contact': 'contact',
};

export function employeeSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}
export function employeePath(nameOrId: string): string {
  return `/employees/${encodeURIComponent(employeeSlug(nameOrId))}`;
}
export function sessionPath(nameOrId: string, sessionId: string): string {
  return `${employeePath(nameOrId)}/sessions/${encodeURIComponent(sessionId)}`;
}
export function alertPath(alertId: string): string { return `/alerts/${encodeURIComponent(alertId)}`; }

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { kind: 'landing', path: '/' };
  if (path === '/login') return { kind: 'login', path: '/login' };
  if (path === '/dashboard') return { kind: 'dashboard', path: '/dashboard' };
  if (path === '/employees') return { kind: 'employees', path: '/employees' };
  if (path === '/alerts') return { kind: 'alerts', path: '/alerts' };
  if (path === '/analytics') return { kind: 'analytics', path: '/analytics' };
  if (path === '/analytics/compare') return { kind: 'compare', path: '/analytics/compare' };
  if (path === '/reports') return { kind: 'reports', path: '/reports' };
  if (path === '/dashboards/customize') return { kind: 'custom-dashboard', path: '/dashboards/customize' };
  if (path === '/saved-views') return { kind: 'saved-views', path: '/saved-views' };
  if (path === '/ai') return { kind: 'ai', path: '/ai' };
  if (path === '/settings/ai') return { kind: 'ai-settings', path: '/settings/ai' };
  if (path === '/settings/notifications') return { kind: 'notifications', path: '/settings/notifications' };
  if (path === '/admin/security') return { kind: 'security-admin', path: '/admin/security' };

  const sessionMatch = path.match(/^\/employees\/([^/]+)\/sessions\/([^/]+)$/);
  if (sessionMatch) return { kind: 'session', path, employeeId: decodeURIComponent(sessionMatch[1]), sessionId: decodeURIComponent(sessionMatch[2]) };
  const employeeMatch = path.match(/^\/employees\/([^/]+)$/);
  if (employeeMatch) return { kind: 'employee', path, employeeId: decodeURIComponent(employeeMatch[1]) };
  const alertMatch = path.match(/^\/alerts\/([^/]+)$/);
  if (alertMatch) return { kind: 'alert', path, alertId: decodeURIComponent(alertMatch[1]) };
  if (MARKETING_PATHS[path]) return { kind: 'marketing', path, view: MARKETING_PATHS[path] };
  return { kind: 'landing', path: '/' };
}

export function navigate(path: string, options?: { replace?: boolean }): void {
  const target = new URL(path, window.location.origin);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const next = `${target.pathname}${target.search}${target.hash}`;
  if (current !== next) {
    if (options?.replace) window.history.replaceState({}, '', next);
    else window.history.pushState({}, '', next);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function updateQuery(params: Record<string, string | number | null | undefined>, replace = true): void {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === 'all') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  });
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (replace) window.history.replaceState({}, '', next);
  else window.history.pushState({}, '', next);
  window.dispatchEvent(new CustomEvent('teler:query-change'));
}

export function routeTitle(route: AppRoute): string {
  switch (route.kind) {
    case 'dashboard': return 'Dashboard | TELER';
    case 'employees': return 'Employees | TELER';
    case 'employee': return 'Employee Detail | TELER';
    case 'session': return 'Session Detail | TELER';
    case 'alerts': return 'Alerts | TELER';
    case 'alert': return 'Alert Detail | TELER';
    case 'analytics': return 'Analytics | TELER';
    case 'compare': return 'Compare Analytics | TELER';
    case 'reports': return 'Reports | TELER';
    case 'custom-dashboard': return 'Customize Dashboard | TELER';
    case 'saved-views': return 'Saved Views | TELER';
    case 'ai': return 'TELER AI | TELER';
    case 'ai-settings': return 'AI Settings | TELER';
    case 'notifications': return 'Notification Settings | TELER';
    case 'security-admin': return 'Security Administration | TELER';
    case 'login': return 'Sign In | TELER';
    default: return 'TELER | AI Workforce Telemetry';
  }
}

export function isAuthenticatedRoute(route: AppRoute): boolean {
  return !['landing', 'login', 'marketing'].includes(route.kind);
}