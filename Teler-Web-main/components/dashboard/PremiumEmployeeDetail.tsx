import React, { useMemo, useState } from 'react';
import { ArrowLeft, BrainCircuit, Clock, GitBranch, RefreshCw, WifiOff, Zap, BarChart3 } from 'lucide-react';
import { Employee, Session, classifyScore } from '../../types';
import { useSessions } from './useSessions';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { generateAlerts } from './alertUtils';
import { WorkspaceToolbar } from './WorkspaceToolbar';

interface Props {
  onLogout: () => void;
  userName?: string;
  initialEmployee?: Employee;
  onBack?: () => void;
}

function fmtDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sessionConfidence(session: Session): number {
  const task = session.detected_tasks?.map(item => item.confidence).filter(Number.isFinite) ?? [];
  const windows = session.micro_windows?.map(item => item.confidence).filter(Number.isFinite) ?? [];
  const all = [...task, ...windows];
  return all.length ? Math.round(all.reduce((a, b) => a + b, 0) / all.length) : 100;
}

export const Dashboard: React.FC<Props> = ({ onLogout, userName = 'User', initialEmployee, onBack }) => {
  const { sessions, loading, error, refetch } = useSessions(initialEmployee?.name);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const alerts = useMemo(() => generateAlerts(sessions), [sessions]);
  const selected = useMemo(() => sessions.find(s => s.id === selectedId) ?? sessions[0] ?? null, [sessions, selectedId]);
  const employee: Employee = initialEmployee ?? {
    name: selected?.userName || selected?.role || 'Employee',
    role: selected?.role ?? '',
    client: selected?.client ?? '',
  };

  const navigate = (section: NavSection) => {
    if (section === 'dashboard') {
      onBack?.();
      return;
    }
    window.dispatchEvent(new CustomEvent<NavSection>('teler:navigate-section', { detail: section }));
  };

  const idlePct = selected && selected.total_minutes > 0 ? Math.round(selected.idle_minutes_estimate / selected.total_minutes * 100) : 0;
  const scoreClass = classifyScore(selected?.overall_productivity_score ?? 0);
  const switches = selected?.app_switches?.length ?? 0;
  const deepWork = selected?.analytics?.deep_work_minutes ?? selected?.hour_blocks?.reduce((a, h) => a + (h.deep_work_minutes ?? 0), 0) ?? 0;
  const evidenceApps = selected?.evidence?.top_apps_minutes ?? [];
  const confidence = selected ? sessionConfidence(selected) : 0;

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection="employees" onNavigate={navigate} alertCount={alerts.length} onLogout={onLogout} clientName={userName} />
    <div className="flex-1 ml-56 min-w-0 flex flex-col min-h-screen relative z-10">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <button type="button" onClick={onBack} aria-label="Back to workforce overview" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary hover:text-primary flex items-center justify-center shrink-0"><ArrowLeft className="w-4 h-4" /></button>
            <div className="min-w-0"><p className="text-xs text-secondary">Employee intelligence</p><h1 className="text-lg md:text-xl font-bold truncate">{employee.name}</h1></div>
          </div>
          <button type="button" onClick={() => refetch(true)} disabled={loading} aria-label="Refresh employee telemetry" title="Refresh employee telemetry" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary hover:text-primary flex items-center justify-center"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </header>

      <main className="p-4 md:p-6 space-y-5 min-w-0">
        <WorkspaceToolbar sessions={sessions} compact />

        <section className="bg-surface-card border border-subtle rounded-2xl p-5 md:p-6 flex flex-wrap gap-5 items-start justify-between">
          <div className="flex gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent text-accent font-bold text-xl flex items-center justify-center shrink-0">{employee.name.slice(0,1).toUpperCase()}</div>
            <div className="min-w-0"><h2 className="text-xl font-bold truncate">{employee.name}</h2><p className="text-sm text-secondary mt-1">{employee.role || 'Role not provided'}{employee.client ? ` · ${employee.client}` : ''}</p><p className="text-xs text-secondary mt-2">{sessions.length} session{sessions.length !== 1 ? 's' : ''} in the current global filter.</p></div>
          </div>
          {selected && <div className={`px-3 py-2 rounded-lg border text-sm font-semibold ${scoreClass.bg} ${scoreClass.border} ${scoreClass.color}`}>{selected.overall_productivity_score}/100 · {scoreClass.label}</div>}
        </section>

        {error && <section className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 flex gap-3 text-red-400"><WifiOff className="w-4 h-4 mt-0.5 shrink-0" /><div><p className="font-semibold text-sm">Live employee data unavailable</p><p className="text-xs mt-1 opacity-80">{error}</p></div></section>}

        {loading && !selected ? <div className="space-y-4"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0,1,2,3].map(i => <div key={i} className="h-28 bg-surface-card border border-subtle rounded-2xl skeleton-shimmer animate-shimmer" />)}</div><div className="h-60 bg-surface-card border border-subtle rounded-2xl skeleton-shimmer animate-shimmer" /></div> : selected ? <>
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { label: 'Productivity', value: `${selected.overall_productivity_score}/100`, sub: scoreClass.label, icon: <Zap className="w-4 h-4" /> },
              { label: 'Deep work', value: fmtDuration(deepWork), sub: `of ${fmtDuration(selected.total_minutes)}`, icon: <BrainCircuit className="w-4 h-4" /> },
              { label: 'Idle time', value: `${idlePct}%`, sub: fmtDuration(selected.idle_minutes_estimate), icon: <Clock className="w-4 h-4" /> },
              { label: 'Context switches', value: switches, sub: selected.total_minutes ? `${Math.round(switches / (selected.total_minutes / 60 || 1))}/hr` : 'this session', icon: <GitBranch className="w-4 h-4" /> },
            ].map(card => <div key={card.label} className="bg-surface-card border border-subtle rounded-2xl p-4 md:p-5"><div className="flex items-center justify-between gap-2"><p className="text-sm text-secondary">{card.label}</p><span className="text-accent">{card.icon}</span></div><p className="text-2xl md:text-3xl font-bold mt-3">{card.value}</p><p className="text-xs text-secondary mt-1">{card.sub}</p></div>)}
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
            <div className="teler-ai-narrative bg-surface-card border border-subtle rounded-2xl p-5 md:p-6">
              <div className="flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-accent" /><h3 className="font-semibold">AI session interpretation</h3><span className="ml-auto text-xs text-secondary">Confidence {confidence}%</span></div>
              <p className="text-sm text-secondary leading-6 mt-4">{selected.executive_summary || `Productivity ${selected.overall_productivity_score}/100 with ${idlePct}% idle time across ${fmtDuration(selected.total_minutes)}.`}</p>
              <div className="mt-5 pt-4 border-t border-subtle"><p className="text-sm font-semibold">Why this conclusion?</p><ul className="mt-2 space-y-2 text-sm text-secondary"><li>Session {selected.id} · {fmtDate(selected.created_at)}</li><li>Focus {selected.focus_score}/100 · idle {idlePct}% · {switches} context switches</li>{selected.main_tasks?.slice(0,2).map(task => <li key={task}>Observed task: {task}</li>)}</ul></div>
            </div>
            <div className="bg-surface-card border border-subtle rounded-2xl p-5 md:p-6"><div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-accent" /><h3 className="font-semibold">Evidence</h3></div>{evidenceApps.length ? <div className="space-y-3 mt-4">{evidenceApps.slice(0,6).map(app => <div key={`${app.app}-${app.minutes}`}><div className="flex justify-between gap-3 text-sm"><span className="truncate">{app.app}</span><span className="text-secondary shrink-0">{fmtDuration(app.minutes)}</span></div><div className="h-1.5 bg-surface-raised rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, app.minutes / Math.max(...evidenceApps.map(a=>a.minutes),1) * 100)}%` }} /></div></div>)}</div> : <p className="text-sm text-secondary mt-4">No application evidence was recorded for this session.</p>}</div>
          </section>

          <section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="p-4 md:p-5 border-b border-subtle"><h3 className="font-semibold">Supporting sessions</h3><p className="text-sm text-secondary mt-1">Choose a session to update every metric and evidence panel above.</p></div><div className="divide-y divide-[rgb(var(--border-subtle)/.45)]">{sessions.map(session => <button key={session.id} type="button" onClick={() => setSelectedId(session.id)} className={`w-full grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto] gap-3 items-center p-4 text-left hover:bg-surface-raised ${selected.id === session.id ? 'bg-accent/10' : ''}`}><span><span className="block text-sm font-semibold">{fmtDate(session.created_at)}</span><span className="block text-xs text-secondary mt-0.5 truncate">{session.main_tasks?.[0] || session.claimed_task || `Session ${session.id}`}</span></span><span className="text-sm font-semibold">{session.overall_productivity_score}</span><span className="hidden md:block text-sm text-secondary">{fmtDuration(session.total_minutes)}</span><span className="hidden md:block text-sm text-secondary">{session.app_switches?.length ?? 0} switches</span></button>)}</div></section>
        </> : <section className="bg-surface-card border border-subtle rounded-2xl p-10 text-center"><h2 className="font-semibold">No sessions in the selected view</h2><p className="text-sm text-secondary mt-2">Adjust the global filters or refresh telemetry.</p></section>}
      </main>
    </div>
  </div>;
};