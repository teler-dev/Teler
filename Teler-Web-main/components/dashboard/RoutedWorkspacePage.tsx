import React, { useMemo, useState } from 'react';
import { ArrowUpDown, BarChart3, Bell, Download, FileText, LockKeyhole, Plus, Save, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Employee, Session } from '../../types';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { useSessions } from './useSessions';
import { generateAlerts } from './alertUtils';
import { getSavedViews, deleteSavedView, SavedView } from '../../services/workspaceService';
import { employeePath, navigate } from '../../services/routerService';

export type WorkspaceRouteKind = 'analytics' | 'compare' | 'reports' | 'custom-dashboard' | 'saved-views' | 'notifications' | 'security-admin';

interface Props {
  kind: WorkspaceRouteKind;
  onLogout: () => void;
  clientName: string;
  onSectionNavigate: (section: NavSection) => void;
}

const KPI_KEY = 'teler_dashboard_kpis';
const DEFAULT_KPIS = ['Workforce Health', 'Active Workforce', 'Deep Work Hours', 'Alerts / Risks', 'Focus Score', 'Idle Rate'];

const ROUTE_META: Record<WorkspaceRouteKind, { title: string; description: string }> = {
  analytics: { title: 'Analytics', description: 'Drill into workforce performance and open the supporting employee evidence.' },
  compare: { title: 'Compare', description: 'Compare employees side by side using the currently filtered telemetry.' },
  reports: { title: 'Reports', description: 'Export current telemetry and prepare executive summaries.' },
  'custom-dashboard': { title: 'Customize Dashboard', description: 'Choose which KPI cards matter most to your management workflow.' },
  'saved-views': { title: 'Saved Views', description: 'Reuse named filter combinations without rebuilding your analysis context.' },
  notifications: { title: 'Notification Settings', description: 'Configure alert delivery when a notification worker is connected.' },
  'security-admin': { title: 'Security Administration', description: 'Review enterprise controls and required setup before enforcement can be enabled.' },
};

function exportCsv(sessions: Session[]) {
  const rows = [
    ['employee','role','team','session_id','created_at','minutes','productivity','focus','idle_minutes','context_switches'],
    ...sessions.map(session => [session.userName ?? '', session.role ?? '', session.client ?? '', session.id, session.created_at, session.total_minutes, session.overall_productivity_score, session.focus_score, session.idle_minutes_estimate, session.app_switches?.length ?? 0]),
  ];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `teler-report-${new Date().toISOString().slice(0,10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const RoutedWorkspacePage: React.FC<Props> = ({ kind, onLogout, clientName, onSectionNavigate }) => {
  const { sessions, loading, error } = useSessions();
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => getSavedViews());
  const [kpis, setKpis] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(KPI_KEY) ?? JSON.stringify(DEFAULT_KPIS)); }
    catch { return DEFAULT_KPIS; }
  });

  const employees = useMemo(() => [...new Set(sessions.map(session => session.userName || session.role).filter(Boolean) as string[])].sort(), [sessions]);
  const alerts = useMemo(() => generateAlerts(sessions), [sessions]);
  const meta = ROUTE_META[kind];
  const statsFor = (name: string) => {
    const list = sessions.filter(session => (session.userName || session.role) === name);
    const total = list.reduce((sum, session) => sum + session.total_minutes, 0);
    return {
      count: list.length,
      score: list.length ? Math.round(list.reduce((sum, session) => sum + session.overall_productivity_score, 0) / list.length) : 0,
      focus: list.length ? Math.round(list.reduce((sum, session) => sum + session.focus_score, 0) / list.length) : 0,
      idle: total ? Math.round(list.reduce((sum, session) => sum + session.idle_minutes_estimate, 0) / total * 100) : 0,
      switches: list.reduce((sum, session) => sum + (session.app_switches?.length ?? 0), 0),
    };
  };
  const a = statsFor(compareA), b = statsFor(compareB);
  const saveKpis = (next: string[]) => { setKpis(next); localStorage.setItem(KPI_KEY, JSON.stringify(next)); };

  const sidebarSection: NavSection = kind === 'notifications' || kind === 'security-admin' ? 'workspace' : 'workspace';

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection={sidebarSection} onNavigate={onSectionNavigate} alertCount={alerts.length} onLogout={onLogout} clientName={clientName} />
    <div className="flex-1 ml-56 min-w-0 min-h-screen">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle">
        <div className="px-4 md:px-6 py-3">
          {kind === 'analytics' && <p className="text-xs text-muted">Workforce Intelligence</p>}
          <h1 className="font-semibold text-primary">{meta.title}</h1>
          <p className="text-xs text-muted mt-1">{meta.description}</p>
        </div>
      </header>
      <main className="p-4 md:p-6 space-y-5 min-w-0">
        {['analytics','compare','reports'].includes(kind) && <WorkspaceToolbar sessions={sessions} />}
        {loading && <div className="h-24 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />}
        {error && <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">{error}</div>}

        {kind === 'analytics' && <section className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
          <div className="grid grid-cols-2 gap-3">{[
            ['Employees', employees.length], ['Sessions', sessions.length], ['Avg productivity', sessions.length ? `${Math.round(sessions.reduce((sum,s)=>sum+s.overall_productivity_score,0)/sessions.length)}/100` : '—'], ['Active alerts', alerts.length],
          ].map(([label,value]) => <div key={label} className="bg-surface-card border border-subtle rounded-2xl p-4"><p className="text-sm text-secondary">{label}</p><p className="text-2xl font-bold mt-2">{value}</p></div>)}</div>
          <div className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="p-4 border-b border-subtle"><h2 className="font-semibold">Employee drill-down</h2><p className="text-sm text-secondary mt-1">Open supporting sessions in a shareable employee view.</p></div>{employees.map(name => { const stats=statsFor(name); return <a key={name} href={employeePath(name)} onClick={event => { event.preventDefault(); navigate(employeePath(name)); }} className="grid grid-cols-[1fr_auto_auto] gap-4 p-4 border-b border-subtle hover:bg-surface-raised"><span><span className="block font-semibold">{name}</span><span className="text-xs text-secondary">{stats.count} supporting sessions</span></span><span className="text-sm"><b>{stats.score}</b> score</span><span className="text-sm"><b>{stats.idle}%</b> idle</span></a>})}</div>
        </section>}

        {kind === 'compare' && <section className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex items-center gap-2 mb-4"><ArrowUpDown className="w-4 h-4 text-accent" /><h2 className="font-semibold">Session comparison</h2></div><div className="flex flex-wrap gap-3 mb-5"><select aria-label="First employee" value={compareA} onChange={event => setCompareA(event.target.value)} className="bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-sm"><option value="">First employee</option>{employees.map(name => <option key={name}>{name}</option>)}</select><select aria-label="Comparison employee" value={compareB} onChange={event => setCompareB(event.target.value)} className="bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-sm"><option value="">Comparison employee</option>{employees.map(name => <option key={name}>{name}</option>)}</select></div>{compareA && compareB ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-secondary border-b border-subtle"><th className="text-left py-3">Metric</th><th className="text-right">{compareA}</th><th className="text-right">{compareB}</th><th className="text-right">Delta</th></tr></thead><tbody>{[['Sessions',a.count,b.count],['Productivity',a.score,b.score],['Focus',a.focus,b.focus],['Idle %',a.idle,b.idle],['Context switches',a.switches,b.switches]].map(([label,av,bv]) => <tr key={String(label)} className="border-b border-subtle"><td className="py-3">{label}</td><td className="text-right">{av}</td><td className="text-right">{bv}</td><td className="text-right font-semibold">{Number(av)-Number(bv)>0?'+':''}{Number(av)-Number(bv)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-secondary">Choose two employees to compare their current filtered evidence.</p>}</section>}

        {kind === 'reports' && <section className="grid gap-4 lg:grid-cols-2"><div className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex gap-2 items-center"><FileText className="w-4 h-4 text-accent" /><h2 className="font-semibold">Executive export</h2></div><p className="text-sm text-secondary mt-2 mb-4">Export the currently filtered telemetry as CSV or print this page to PDF.</p><div className="flex gap-2 flex-wrap"><button type="button" onClick={() => exportCsv(sessions)} className="px-4 py-2 rounded-lg bg-accent text-white text-sm flex items-center gap-2"><Download className="w-4 h-4" />Export CSV</button><button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-surface-raised border border-subtle text-sm">Print / PDF</button></div></div><div className="bg-surface-card border border-subtle rounded-2xl p-5 opacity-70"><div className="flex gap-2 items-center"><LockKeyhole className="w-4 h-4 text-secondary" /><h2 className="font-semibold">Scheduled delivery</h2></div><p className="text-sm text-secondary mt-2">Requires an outbound email worker and organization-level delivery configuration before it can be enabled.</p><button disabled className="mt-4 px-4 py-2 rounded-lg border border-subtle bg-surface-raised text-secondary text-sm cursor-not-allowed">Set up delivery first</button></div></section>}

        {kind === 'custom-dashboard' && <section className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex gap-2 items-center"><SlidersHorizontal className="w-4 h-4 text-accent" /><h2 className="font-semibold">Dashboard KPI layout</h2></div><p className="text-sm text-secondary mt-2 mb-4">This prototype preference is stored in this browser. Account-level persistence requires a user-preferences API.</p><div className="space-y-2">{kpis.map((kpi,index) => <div key={kpi} className="flex items-center gap-3 p-3 bg-surface-raised border border-subtle rounded-xl"><span className="w-6 text-secondary text-xs">{index+1}</span><span className="flex-1 text-sm font-medium">{kpi}</span><button type="button" disabled={index===0} aria-label={`Move ${kpi} up`} onClick={() => { const next=[...kpis]; [next[index-1],next[index]]=[next[index],next[index-1]]; saveKpis(next); }}>↑</button><button type="button" disabled={index===kpis.length-1} aria-label={`Move ${kpi} down`} onClick={() => { const next=[...kpis]; [next[index+1],next[index]]=[next[index],next[index+1]]; saveKpis(next); }}>↓</button><button type="button" aria-label={`Remove ${kpi}`} onClick={() => saveKpis(kpis.filter(item=>item!==kpi))} className="text-secondary hover:text-danger"><Trash2 className="w-4 h-4" /></button></div>)}</div><div className="flex flex-wrap gap-2 mt-4">{DEFAULT_KPIS.filter(kpi=>!kpis.includes(kpi)).map(kpi => <button key={kpi} type="button" onClick={() => saveKpis([...kpis,kpi])} className="text-xs px-3 py-2 rounded-lg border border-subtle bg-surface-raised"><Plus className="w-3 h-3 inline mr-1" />{kpi}</button>)}</div></section>}

        {kind === 'saved-views' && <section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="p-5 border-b border-subtle"><div className="flex gap-2 items-center"><Save className="w-4 h-4 text-accent" /><h2 className="font-semibold">Saved views</h2></div><p className="text-sm text-secondary mt-2">Saved filters are currently browser-local. Account synchronization requires a saved-views API.</p></div>{savedViews.length ? savedViews.map(view => <div key={view.id} className="flex items-center gap-3 p-4 border-b border-subtle"><div className="flex-1"><p className="font-semibold text-sm">{view.name}</p><p className="text-xs text-secondary mt-1">{view.filters.days === 9999 ? 'All time' : `${view.filters.days} days`} · {view.filters.team === 'all' ? 'All teams' : view.filters.team} · {view.filters.risk === 'all' ? 'All risk' : view.filters.risk}</p></div><a href={`/dashboard?days=${view.filters.days}&team=${encodeURIComponent(view.filters.team)}&risk=${view.filters.risk}`} className="text-xs text-accent hover:underline">Open</a><button type="button" aria-label={`Delete ${view.name}`} onClick={() => { deleteSavedView(view.id); setSavedViews(getSavedViews()); }} className="text-secondary hover:text-danger"><Trash2 className="w-4 h-4" /></button></div>) : <div className="p-10 text-center text-sm text-secondary">No saved views yet.</div>}</section>}

        {kind === 'notifications' && <section className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex gap-2 items-center"><Bell className="w-4 h-4 text-secondary" /><h2 className="font-semibold">Notification routing</h2></div><p className="text-sm text-secondary mt-2 max-w-2xl">Slack, Teams, email and webhook routing requires a server-side delivery worker. Configuration is disabled until that service is connected.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{['Email','Slack','Microsoft Teams','Webhook'].map(channel => <div key={channel} className="p-4 rounded-xl border border-subtle bg-surface-raised opacity-70"><p className="font-semibold text-sm">{channel}</p><p className="text-xs text-secondary mt-1">Delivery service not connected</p><button disabled className="mt-3 px-3 py-2 rounded-lg border border-subtle text-xs cursor-not-allowed">Connect service first</button></div>)}</div></section>}

        {kind === 'security-admin' && <section className="grid gap-4 lg:grid-cols-2"><div className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex gap-2 items-center"><ShieldCheck className="w-4 h-4 text-accent" /><h2 className="font-semibold">Identity & access</h2></div><p className="text-sm text-secondary mt-2">SSO, enforced MFA and role-based access require organization administration endpoints before they can be enabled from this console.</p>{['Single sign-on','Enforced MFA','Role-based access control'].map(item => <div key={item} className="flex items-center justify-between gap-3 py-3 border-b border-subtle"><span className="text-sm">{item}</span><span className="text-xs text-secondary">Setup required</span></div>)}</div><div className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex gap-2 items-center"><LockKeyhole className="w-4 h-4 text-secondary" /><h2 className="font-semibold">Data governance</h2></div><p className="text-sm text-secondary mt-2">Retention, consent, audit and redaction policies remain read-only until organization policy enforcement is connected.</p>{['Retention policy','Employee consent','Audit logging','Sensitive-data redaction'].map(item => <div key={item} className="flex items-center justify-between gap-3 py-3 border-b border-subtle"><span className="text-sm">{item}</span><span className="text-xs text-secondary">Setup required</span></div>)}</div></section>}
      </main>
    </div>
  </div>;
};