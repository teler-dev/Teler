import { AlertSeverity } from '../components/dashboard/alertUtils';

export type ComparisonPeriod = 'previous_period' | 'previous_week' | 'previous_month';
export type RiskFilter = 'all' | 'healthy' | 'attention' | 'high';

export interface WorkspaceFilters {
  days: number;
  team: string;
  role: string;
  office: string;
  risk: RiskFilter;
  schedule: string;
  timezone: string;
  compare: ComparisonPeriod;
}

export interface SavedView {
  id: string;
  name: string;
  filters: WorkspaceFilters;
  createdAt: string;
}

export type AlertWorkflowStatus = 'open' | 'acknowledged' | 'snoozed' | 'resolved';
export interface AlertWorkflowState {
  status: AlertWorkflowStatus;
  owner: string;
  note: string;
  snoozedUntil: string | null;
  updatedAt: string;
  history: Array<{ at: string; action: string; actor: string }>;
}

export interface EnterprisePreferences {
  ssoRequired: boolean;
  mfaRequired: boolean;
  rawRetentionDays: number;
  screenshotRetentionDays: number;
  employeeConsentRequired: boolean;
  redactSensitiveData: boolean;
  auditLogging: boolean;
}

export interface NotificationRoute {
  id: string;
  channel: 'email' | 'slack' | 'teams' | 'webhook';
  destination: string;
  minimumSeverity: AlertSeverity;
  enabled: boolean;
}

const FILTER_KEY = 'teler_workspace_filters';
const VIEW_KEY = 'teler_saved_views';
const ALERT_KEY = 'teler_alert_workflow';
const ENTERPRISE_KEY = 'teler_enterprise_preferences';
const NOTIFICATION_KEY = 'teler_notification_routes';
const EVENT = 'teler:workspace-change';

export const DEFAULT_FILTERS: WorkspaceFilters = {
  days: 30,
  team: 'all',
  role: 'all',
  office: 'all',
  risk: 'all',
  schedule: 'all',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  compare: 'previous_period',
};

export const DEFAULT_ENTERPRISE: EnterprisePreferences = {
  ssoRequired: false,
  mfaRequired: true,
  rawRetentionDays: 90,
  screenshotRetentionDays: 30,
  employeeConsentRequired: true,
  redactSensitiveData: true,
  auditLogging: true,
};

function readObject<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function emit(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function getWorkspaceFilters(): WorkspaceFilters {
  return readObject(FILTER_KEY, { ...DEFAULT_FILTERS });
}

export function saveWorkspaceFilters(filters: WorkspaceFilters): void {
  localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
  emit();
}

export function getSavedViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) ?? '[]') as SavedView[];
  } catch {
    return [];
  }
}

export function saveView(name: string, filters: WorkspaceFilters): SavedView {
  const view: SavedView = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Saved view',
    filters: { ...filters },
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(VIEW_KEY, JSON.stringify([view, ...getSavedViews()].slice(0, 20)));
  emit();
  return view;
}

export function deleteSavedView(id: string): void {
  localStorage.setItem(VIEW_KEY, JSON.stringify(getSavedViews().filter(view => view.id !== id)));
  emit();
}

export function getAlertWorkflows(): Record<string, AlertWorkflowState> {
  try {
    return JSON.parse(localStorage.getItem(ALERT_KEY) ?? '{}') as Record<string, AlertWorkflowState>;
  } catch {
    return {};
  }
}

export function getAlertWorkflow(alertId: string): AlertWorkflowState {
  return getAlertWorkflows()[alertId] ?? {
    status: 'open',
    owner: '',
    note: '',
    snoozedUntil: null,
    updatedAt: new Date().toISOString(),
    history: [],
  };
}

export function updateAlertWorkflow(alertId: string, patch: Partial<AlertWorkflowState>, actor = 'Manager'): AlertWorkflowState {
  const all = getAlertWorkflows();
  const current = getAlertWorkflow(alertId);
  const status = patch.status ?? current.status;
  const action = status !== current.status ? `Status changed to ${status}` : 'Alert workflow updated';
  const next: AlertWorkflowState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    history: [{ at: new Date().toISOString(), action, actor }, ...current.history].slice(0, 30),
  };
  all[alertId] = next;
  localStorage.setItem(ALERT_KEY, JSON.stringify(all));
  emit();
  return next;
}

export function getEnterprisePreferences(): EnterprisePreferences {
  return readObject(ENTERPRISE_KEY, { ...DEFAULT_ENTERPRISE });
}

export function saveEnterprisePreferences(prefs: EnterprisePreferences): void {
  localStorage.setItem(ENTERPRISE_KEY, JSON.stringify(prefs));
  emit();
}

export function getNotificationRoutes(): NotificationRoute[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATION_KEY) ?? '[]') as NotificationRoute[];
  } catch {
    return [];
  }
}

export function saveNotificationRoutes(routes: NotificationRoute[]): void {
  localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(routes));
  emit();
}

export function subscribeWorkspace(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function filterSessionsByWorkspace<T extends {
  created_at: string;
  client?: string;
  role?: string;
  overall_productivity_score: number;
  idle_minutes_estimate: number;
  total_minutes: number;
}>(sessions: T[], filters = getWorkspaceFilters()): T[] {
  const cutoff = filters.days === 9999 ? null : (() => {
    const date = new Date();
    date.setDate(date.getDate() - filters.days);
    date.setHours(0, 0, 0, 0);
    return date;
  })();

  return sessions.filter(session => {
    if (cutoff && new Date(session.created_at) < cutoff) return false;
    if (filters.team !== 'all' && (session.client ?? '') !== filters.team) return false;
    if (filters.role !== 'all' && (session.role ?? '') !== filters.role) return false;
    if (filters.risk !== 'all') {
      const idlePct = session.total_minutes > 0 ? session.idle_minutes_estimate / session.total_minutes : 0;
      const high = session.overall_productivity_score < 41 || idlePct > 0.4;
      const attention = high || session.overall_productivity_score < 71 || idlePct > 0.25;
      if (filters.risk === 'high' && !high) return false;
      if (filters.risk === 'attention' && !attention) return false;
      if (filters.risk === 'healthy' && attention) return false;
    }
    return true;
  });
}