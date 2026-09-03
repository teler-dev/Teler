import React, { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, Clock, ShieldCheck } from 'lucide-react';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { useSessions } from './useSessions';
import { ALERT_DESCRIPTION, generateAlerts, SEVERITY_CONFIG } from './alertUtils';
import { AlertWorkflowPanel } from './AlertWorkflowPanel';
import { alertPath, employeePath, navigate, sessionPath } from '../../services/routerService';

interface Props {
  alertId: string;
  onLogout: () => void;
  clientName: string;
  onSectionNavigate: (section: NavSection) => void;
}

export const FullAlertPage: React.FC<Props> = ({ alertId, onLogout, clientName, onSectionNavigate }) => {
  const { sessions, loading, error } = useSessions();
  const alerts = useMemo(() => generateAlerts(sessions), [sessions]);
  const alert = alerts.find(item => item.id === alertId) ?? null;
  const session = alert ? sessions.find(item => item.id === alert.sessionId) ?? null : null;
  const related = alert ? alerts.filter(item => item.employeeName === alert.employeeName && item.id !== alert.id).slice(0, 5) : [];

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection="alerts" onNavigate={onSectionNavigate} alertCount={alerts.length} onLogout={onLogout} clientName={clientName} />
    <div className="flex-1 ml-56 min-w-0 min-h-screen">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle"><div className="px-4 md:px-6 py-4 flex items-center gap-3"><a href="/alerts" onClick={event => { event.preventDefault(); navigate('/alerts'); }} aria-label="Back to alerts" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></a><div><h1 className="text-xl md:text-2xl font-bold">Alert Detail</h1><p className="text-sm text-secondary mt-1">Shareable investigation, evidence, ownership and activity history.</p></div></div></header>
      <main className="p-4 md:p-6 space-y-5 max-w-6xl">
        {loading && <div className="h-40 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />}
        {error && <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm">{error}</div>}
        {!loading && !alert && <section className="bg-surface-card border border-subtle rounded-2xl p-10 text-center"><ShieldCheck className="w-7 h-7 text-secondary mx-auto" /><h2 className="font-semibold mt-3">Alert not found</h2><p className="text-sm text-secondary mt-2">This alert may no longer exist in the current telemetry window.</p><a href="/alerts" className="inline-block mt-4 text-accent text-sm">Return to alerts</a></section>}
        {alert && <>
          <section className="bg-surface-card border border-subtle rounded-2xl p-5 md:p-6"><div className="flex items-start justify-between gap-4 flex-wrap"><div className="flex gap-3"><div className={`w-10 h-10 rounded-xl ${SEVERITY_CONFIG[alert.severity].bg} border ${SEVERITY_CONFIG[alert.severity].border} flex items-center justify-center`}><AlertTriangle className={`w-4 h-4 ${SEVERITY_CONFIG[alert.severity].color}`} /></div><div><p className={`text-xs font-semibold uppercase tracking-wide ${SEVERITY_CONFIG[alert.severity].color}`}>{alert.severity}</p><h2 className="text-xl font-bold mt-1">{alert.alertLabel}</h2><p className="text-sm text-secondary mt-1">{alert.employeeName}{alert.employeeRole ? ` · ${alert.employeeRole}` : ''}</p></div></div><span className="text-sm text-secondary flex items-center gap-1.5"><Clock className="w-4 h-4" />{new Date(alert.timestamp).toLocaleString()}</span></div><div className="grid gap-4 md:grid-cols-3 mt-6"><div className="p-4 bg-surface-raised border border-subtle rounded-xl"><p className="text-xs text-secondary">Detected metric</p><p className="font-semibold mt-2">{alert.details}</p></div><div className="p-4 bg-surface-raised border border-subtle rounded-xl md:col-span-2"><p className="text-xs text-secondary">Rule context</p><p className="text-sm mt-2 leading-6">{ALERT_DESCRIPTION[alert.alertType]}</p></div></div></section>

          <div className="grid gap-5 lg:grid-cols-[1fr_.8fr]"><section className="bg-surface-card border border-subtle rounded-2xl p-5"><h3 className="font-semibold">Supporting evidence</h3>{session ? <div className="mt-4 space-y-3"><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[['Productivity',`${session.overall_productivity_score}/100`],['Focus',`${session.focus_score}/100`],['Idle',session.total_minutes ? `${Math.round(session.idle_minutes_estimate/session.total_minutes*100)}%` : '0%'],['Switches',session.app_switches?.length ?? 0]].map(([label,value]) => <div key={label} className="p-3 rounded-xl bg-surface-raised border border-subtle"><p className="text-xs text-secondary">{label}</p><p className="font-semibold mt-1">{value}</p></div>)}</div><p className="text-sm text-secondary">Session {session.id} · {new Date(session.session_start).toLocaleString()} – {new Date(session.session_end).toLocaleTimeString()}</p><div className="flex flex-wrap gap-2"><a href={employeePath(alert.employeeName)} onClick={event => { event.preventDefault(); navigate(employeePath(alert.employeeName)); }} className="px-3 py-2 rounded-lg border border-subtle bg-surface-raised text-sm">Open employee</a><a href={sessionPath(alert.employeeName, session.id)} onClick={event => { event.preventDefault(); navigate(sessionPath(alert.employeeName, session.id)); }} className="px-3 py-2 rounded-lg bg-accent text-white text-sm">Open session</a></div></div> : <p className="text-sm text-secondary mt-4">Supporting session is not available in the current filter window.</p>}</section><AlertWorkflowPanel alertId={alert.id} /></div>

          <section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="p-5 border-b border-subtle"><h3 className="font-semibold">Related alerts</h3><p className="text-sm text-secondary mt-1">Other alerts for {alert.employeeName}.</p></div>{related.length ? related.map(item => <a key={item.id} href={alertPath(item.id)} onClick={event => { event.preventDefault(); navigate(alertPath(item.id)); }} className="flex items-center gap-3 p-4 border-b border-subtle hover:bg-surface-raised"><span className={`w-2 h-2 rounded-full ${SEVERITY_CONFIG[item.severity].dot}`} /><span className="flex-1"><span className="block text-sm font-semibold">{item.alertLabel}</span><span className="block text-xs text-secondary mt-0.5">{item.details}</span></span><ChevronRight className="w-4 h-4 text-secondary" /></a>) : <div className="p-6 text-sm text-secondary">No related alerts in the current telemetry window.</div>}</section>
        </>}
      </main>
    </div>
  </div>;
};