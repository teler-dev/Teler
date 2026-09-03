import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Employee } from './types';
import { EmployerOverview } from './components/dashboard/EmployerOverview';
import { EmployeesPage } from './components/dashboard/EmployeesPage';
import { AlertsPage } from './components/dashboard/AlertsPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { DashboardSidebar, NavSection } from './components/dashboard/DashboardSidebar';
import { AiChatPanel } from './components/dashboard/AiChatPanel';
import { GlobalCommandBar } from './components/dashboard/GlobalCommandBar';
import { AiSettingsPanel } from './components/settings/AiSettingsPanel';
import { RoutedWorkspacePage, WorkspaceRouteKind } from './components/dashboard/RoutedWorkspacePage';
import { FullAlertPage } from './components/dashboard/FullAlertPage';
import { FullAiPage } from './components/dashboard/FullAiPage';
import { useSessions } from './components/dashboard/useSessions';
import { getCurrentUser, logout } from './services/authService';
import { applyTheme } from './services/themeService';
import { AppRoute, employeePath, employeeSlug, navigate, parseRoute, routeTitle } from './services/routerService';

const routeForSection: Record<NavSection, string> = {
  dashboard: '/dashboard', employees: '/employees', sessions: '/employees', reports: '/reports',
  alerts: '/alerts', settings: '/settings/ai', 'ai-settings': '/settings/ai', workspace: '/analytics',
};
function resolveEmployee(route: AppRoute, sessions: ReturnType<typeof useSessions>['sessions']): Employee | null {
  if (route.kind !== 'employee' && route.kind !== 'session') return null;
  const match = sessions.find(session => employeeSlug(session.userName || session.role || '') === route.employeeId);
  return match ? { name: match.userName || match.role || route.employeeId, role: match.role ?? '', client: match.client ?? '' } : null;
}

const AiSettingsRoute: React.FC<{ onLogout: () => void; clientName: string; onNavigate: (section: NavSection) => void }> = ({ onLogout, clientName, onNavigate }) => {
  const { sessions } = useSessions();
  const alertCount = sessions.filter(session => (session.red_flags?.length ?? 0) > 0).length;
  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection="ai-settings" onNavigate={onNavigate} alertCount={alertCount} onLogout={onLogout} clientName={clientName} />
    <div className="flex-1 ml-56 min-w-0 min-h-screen">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle"><div className="px-4 md:px-6 py-4 flex items-center gap-3"><a href="/dashboard" onClick={event => { if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('/dashboard');} }} aria-label="Back to dashboard" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></a><div><h1 className="text-xl md:text-2xl font-bold">AI Settings</h1><p className="text-sm text-secondary mt-1">Provider, models, retrieval, response behavior, privacy, diagnostics and usage configuration.</p></div></div></header>
      <main className="p-4 md:p-6 max-w-5xl"><div className="bg-surface-card border border-subtle rounded-2xl overflow-hidden min-h-[680px]"><AiSettingsPanel onClose={() => navigate('/dashboard')} /></div></main>
    </div>
  </div>;
};

export const AuthenticatedRouter: React.FC = () => {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute());
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated'>('checking');
  const [username, setUsername] = useState('');
  const [showAiChat, setShowAiChat] = useState(false);
  const { sessions: globalSessions } = useSessions(undefined, authStatus === 'authenticated');

  useEffect(() => {
    applyTheme();
    const sync = () => setRoute(parseRoute());
    const openAi = () => setShowAiChat(true);
    window.addEventListener('popstate', sync);
    window.addEventListener('teler:open-ai', openAi);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('teler:open-ai', openAi); };
  }, []);
  useEffect(() => {
    document.title = routeTitle(route);
    window.scrollTo(0, 0);
    if (route.kind === 'dashboard') {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('days')) {
        url.searchParams.set('days', '7');
        window.history.replaceState({}, '', `${url.pathname}${url.search}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  }, [route]);
  useEffect(() => {
    let active = true;
    getCurrentUser().then(user => {
      if (!active) return;
      if (!user) { window.location.replace('/login'); return; }
      setUsername(user.username); setAuthStatus('authenticated');
    }).catch(() => window.location.replace('/login'));
    return () => { active = false; };
  }, []);

  const doLogout = async () => { await logout(); window.location.assign('/'); };
  const onSectionNavigate = (section: NavSection) => navigate(routeForSection[section] ?? '/dashboard');
  const onEmployeeClick = (employee: Employee) => navigate(employeePath(employee.name));
  const employee = useMemo(() => resolveEmployee(route, globalSessions), [route, globalSessions]);

  if (authStatus !== 'authenticated') return <div className="min-h-screen bg-surface-page text-primary flex items-center justify-center"><div role="status" aria-live="polite" className="text-sm text-secondary">Restoring secure TELER session…</div></div>;

  let page: React.ReactNode = null;
  if (route.kind === 'dashboard') page = <EmployerOverview onLogout={doLogout} onEmployeeClick={onEmployeeClick} onSectionNavigate={onSectionNavigate} clientName={username} />;
  else if (route.kind === 'employees') page = <EmployeesPage onLogout={doLogout} onEmployeeClick={onEmployeeClick} onSectionNavigate={onSectionNavigate} clientName={username} />;
  else if (route.kind === 'employee' || route.kind === 'session') page = employee ? <Dashboard onLogout={doLogout} userName={username} initialEmployee={employee} onBack={() => navigate('/employees')} /> : <div className="min-h-screen bg-surface-page text-primary flex items-center justify-center"><p className="text-sm text-secondary">Resolving employee telemetry…</p></div>;
  else if (route.kind === 'alerts') page = <AlertsPage onLogout={doLogout} onEmployeeClick={onEmployeeClick} onSectionNavigate={onSectionNavigate} clientName={username} />;
  else if (route.kind === 'alert') page = <FullAlertPage alertId={route.alertId} onLogout={doLogout} clientName={username} onSectionNavigate={onSectionNavigate} />;
  else if (['analytics','compare','reports','custom-dashboard','saved-views','notifications','security-admin'].includes(route.kind)) page = <RoutedWorkspacePage kind={route.kind as WorkspaceRouteKind} onLogout={doLogout} clientName={username} onSectionNavigate={onSectionNavigate} />;
  else if (route.kind === 'ai') page = <FullAiPage onLogout={doLogout} clientName={username} onSectionNavigate={onSectionNavigate} />;
  else if (route.kind === 'ai-settings') page = <AiSettingsRoute onLogout={doLogout} clientName={username} onNavigate={onSectionNavigate} />;
  else navigate('/dashboard', { replace: true });

  return <>
    {page}
    <GlobalCommandBar sessions={globalSessions} onNavigate={onSectionNavigate} onEmployee={onEmployeeClick} onOpenAi={() => setShowAiChat(true)} />
    {showAiChat && <AiChatPanel sessions={globalSessions} onClose={() => setShowAiChat(false)} />}
  </>;
};