import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, BrainCircuit, CheckCircle, Clock,
  Info, RefreshCw, Search, TrendingUp, Users, Wifi, WifiOff, Zap,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { Employee, Session, classifyScore } from '../../types';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { generateAlerts } from './alertUtils';
import { useSessions } from './useSessions';

const CHART_TEXT = 'rgb(var(--text-muted))';
const CHART_GRID = 'rgb(var(--border-subtle))';
const CHART_TOOLTIP_BG = 'rgb(var(--surface-raised))';
const CHART_TOOLTIP_TEXT = 'rgb(var(--text-primary))';
const CHART_ACCENT = 'rgb(var(--accent))';
const CHART_SUCCESS = 'rgb(var(--success))';
const CHART_WARNING = 'rgb(var(--warning))';
const CHART_DANGER = 'rgb(var(--danger))';

interface Props {
  onLogout: () => void;
  onEmployeeClick: (employee: Employee) => void;
  onSectionNavigate: (section: NavSection) => void;
  clientName?: string;
}

type EmployeeStatus = 'working' | 'idle' | 'offline';
type RiskLevel = 'low' | 'medium' | 'high';

interface EmployeeStat {
  employee: Employee;
  sessions: Session[];
  score: number;
  focus: number;
  activeMinutes: number;
  idlePct: number;
  switches: number;
  alertCount: number;
  lastSeen: string | null;
  status: EmployeeStatus;
  risk: RiskLevel;
}

const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const dateKey = (value: string) => value.slice(0, 10);

function fmtMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

function getStatus(value: string | null): EmployeeStatus {
  if (!value) return 'offline';
  const age = Date.now() - new Date(value).getTime();
  if (age < 10 * 60_000) return 'working';
  if (age < 30 * 60_000) return 'idle';
  return 'offline';
}

function getRisk(score: number, idlePct: number, alerts: number): RiskLevel {
  if (alerts > 0 || score < 50 || idlePct > 35) return 'high';
  if (score < 70 || idlePct > 25) return 'medium';
  return 'low';
}

function buildEmployeeStats(sessions: Session[]): EmployeeStat[] {
  const alerts = generateAlerts(sessions);
  const grouped = new Map<string, Session[]>();
  for (const session of sessions) {
    const name = session.userName || session.role || 'Unknown employee';
    grouped.set(name, [...(grouped.get(name) ?? []), session]);
  }

  return [...grouped.entries()].map(([name, list]) => {
    const sorted = [...list].sort((a, b) => new Date(b.session_end || b.created_at).getTime() - new Date(a.session_end || a.created_at).getTime());
    const latest = sorted[0];
    const scores = list.map(item => item.overall_productivity_score).filter(value => value > 0);
    const focus = list.map(item => item.focus_score).filter(value => value > 0);
    const totalMinutes = list.reduce((sum, item) => sum + (item.total_minutes || 0), 0);
    const activeMinutes = list.reduce((sum, item) => sum + (item.active_minutes_estimate || 0), 0);
    const idleMinutes = list.reduce((sum, item) => sum + (item.idle_minutes_estimate || 0), 0);
    const alertCount = alerts.filter(alert => alert.employeeName === name).length;
    const score = Math.round(avg(scores));
    const idlePct = totalMinutes ? Math.round((idleMinutes / totalMinutes) * 100) : 0;
    const lastSeen = latest?.session_end || latest?.created_at || null;
    return {
      employee: { name, role: latest?.role ?? '', client: latest?.client ?? '' },
      sessions: sorted,
      score,
      focus: Math.round(avg(focus)),
      activeMinutes,
      idlePct,
      switches: list.reduce((sum, item) => sum + (item.app_switches?.length ?? 0), 0),
      alertCount,
      lastSeen,
      status: getStatus(lastSeen),
      risk: getRisk(score, idlePct, alertCount),
    };
  }).sort((a, b) => b.alertCount - a.alertCount || b.score - a.score);
}

function buildTrend(sessions: Session[]) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    const daily = sessions.filter(session => dateKey(session.created_at) === key);
    const productivity = daily.map(item => item.overall_productivity_score).filter(value => value > 0);
    const focus = daily.map(item => item.focus_score).filter(value => value > 0);
    const total = daily.reduce((sum, item) => sum + (item.total_minutes || 0), 0);
    const idle = daily.reduce((sum, item) => sum + (item.idle_minutes_estimate || 0), 0);
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'short' }),
      productivity: productivity.length ? Math.round(avg(productivity)) : null,
      focus: focus.length ? Math.round(avg(focus)) : null,
      idle: total ? Math.round((idle / total) * 100) : null,
    };
  });
}

function buildHourly(sessions: Session[]) {
  const hours = Array.from({ length: 17 }, (_, index) => ({ hour: index + 6, active: 0, idle: 0 }));
  for (const session of sessions) {
    const started = new Date(session.session_start || session.created_at);
    if (Number.isNaN(started.getTime()) || !session.total_minutes) continue;
    const start = started.getHours() * 60 + started.getMinutes();
    const end = start + session.total_minutes;
    const idleRatio = session.total_minutes ? clamp(session.idle_minutes_estimate / session.total_minutes, 0, 1) : 0;
    for (const bucket of hours) {
      const bucketStart = bucket.hour * 60;
      const overlap = Math.max(0, Math.min(end, bucketStart + 60) - Math.max(start, bucketStart));
      bucket.idle += overlap * idleRatio;
      bucket.active += overlap * (1 - idleRatio);
    }
  }
  return hours.map(item => ({ label: `${item.hour}:00`, active: Math.round(item.active), idle: Math.round(item.idle) }));
}

const MetricCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  onClick?: () => void;
}> = ({ label, value, sub, icon, tone = 'accent', onClick }) => {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-accent';
  const Component: React.ElementType = onClick ? 'button' : 'div';
  return <Component onClick={onClick} className={`bg-surface-card border border-subtle rounded-2xl p-4 md:p-5 text-left shadow-card transition-colors ${onClick ? 'hover:border-strong cursor-pointer' : ''}`}>
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</p><span className={toneClass}>{icon}</span></div>
    <p className={`text-2xl md:text-3xl font-bold mt-3 ${toneClass}`}>{value}</p>
    <p className="text-xs text-muted mt-1.5 leading-5">{sub}</p>
  </Component>;
};

const ThemedTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return <div style={{ background: CHART_TOOLTIP_BG, color: CHART_TOOLTIP_TEXT, border: `1px solid ${CHART_GRID}`, borderRadius: 12, padding: '10px 12px', boxShadow: 'var(--shadow-card)', fontSize: 12 }}>
    {label && <p style={{ fontWeight: 700, marginBottom: 6 }}>{label}</p>}
    {payload.map((item: any) => <div key={item.dataKey || item.name} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 3 }}><span style={{ color: CHART_TEXT }}>{item.name || item.dataKey}</span><strong>{item.value ?? '—'}</strong></div>)}
  </div>;
};

const Skeleton = () => <div className="p-4 md:p-6 space-y-5" role="status" aria-label="Loading dashboard">
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map(item => <div key={item} className="h-28 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card" />)}</div>
  <div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 h-52 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card"/><div className="h-52 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card"/></div>
  <div className="h-56 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer shadow-card"/>
</div>;

export const EmployerOverview: React.FC<Props> = ({ onLogout, onEmployeeClick, onSectionNavigate, clientName = 'Your Company' }) => {
  const { sessions, loading, usingMock, error, refetch } = useSessions();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'risk' | 'score' | 'name'>('risk');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const refresh = window.setInterval(() => refetch(false), 30_000);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => { window.clearInterval(refresh); window.clearInterval(clock); };
  }, [refetch]);

  const alerts = useMemo(() => generateAlerts(sessions), [sessions]);
  const employees = useMemo(() => buildEmployeeStats(sessions), [sessions]);
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q ? employees.filter(row => `${row.employee.name} ${row.employee.role} ${row.employee.client}`.toLowerCase().includes(q)) : [...employees];
    return rows.sort((a, b) => sort === 'name' ? a.employee.name.localeCompare(b.employee.name) : sort === 'score' ? b.score - a.score : ({ high: 0, medium: 1, low: 2 }[a.risk] - { high: 0, medium: 1, low: 2 }[b.risk]));
  }, [employees, search, sort]);

  const totalTracked = sessions.reduce((sum, item) => sum + (item.total_minutes || 0), 0);
  const totalIdle = sessions.reduce((sum, item) => sum + (item.idle_minutes_estimate || 0), 0);
  const activeToday = employees.filter(item => item.status !== 'offline').length;
  const avgScore = Math.round(avg(employees.map(item => item.score).filter(Boolean)));
  const avgFocus = Math.round(avg(employees.map(item => item.focus).filter(Boolean)));
  const idlePct = totalTracked ? Math.round((totalIdle / totalTracked) * 100) : 0;
  const health = avgScore ? clamp(Math.round(avgScore * .5 + avgFocus * .3 + (activeToday / Math.max(employees.length, 1)) * 20 - Math.min(alerts.length * 2, 20))) : 0;
  const deepWorkMinutes = sessions.reduce((sum, item) => sum + (item.analytics?.deep_work_minutes ?? item.hour_blocks?.reduce((subtotal, block) => subtotal + (block.deep_work_minutes ?? 0), 0) ?? 0), 0);
  const trend = useMemo(() => buildTrend(sessions), [sessions]);
  const hourly = useMemo(() => buildHourly(sessions), [sessions]);
  const distribution = employees.filter(item => item.score > 0).slice(0, 12).map(item => ({ name: item.employee.name.split(' ')[0], fullName: item.employee.name, score: item.score }));

  const insights = useMemo(() => {
    const items: Array<{ icon: React.ReactNode; title: string; body: string; tone: string }> = [];
    if (alerts.length) items.push({ icon: <AlertTriangle className="w-4 h-4"/>, title: `${alerts.length} active alert${alerts.length === 1 ? '' : 's'}`, body: 'Review the highest-risk employees and supporting sessions before taking action.', tone: 'text-danger' });
    if (idlePct > 25) items.push({ icon: <Clock className="w-4 h-4"/>, title: `Idle time is ${idlePct}%`, body: 'Look for recurring untracked periods, meetings, or workflow blockers before interpreting this as disengagement.', tone: 'text-warning' });
    if (avgFocus >= 70) items.push({ icon: <CheckCircle className="w-4 h-4"/>, title: `Focus is strong at ${avgFocus}/100`, body: 'The current telemetry supports sustained concentration across the selected sessions.', tone: 'text-success' });
    if (!items.length) items.push({ icon: <Info className="w-4 h-4"/>, title: 'No urgent workforce signal', body: 'Continue collecting telemetry; stronger conclusions require sufficient supporting sessions.', tone: 'text-info' });
    return items.slice(0, 3);
  }, [alerts.length, idlePct, avgFocus]);

  const statusText = error ? 'API error' : usingMock ? 'Development data' : 'Live API';
  const statusIcon = error || usingMock ? <WifiOff className="w-3.5 h-3.5"/> : <Wifi className="w-3.5 h-3.5"/>;

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection="dashboard" onNavigate={onSectionNavigate} alertCount={alerts.length} onLogout={onLogout} clientName={clientName}/>
    <div className="flex-1 ml-56 min-w-0 min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <div><p className="text-xs text-muted">Workforce Intelligence</p><h1 className="font-semibold text-primary">Dashboard</h1></div>
          <div className="flex items-center gap-2">
            <span className={`hidden sm:flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-subtle bg-surface-raised ${error ? 'text-danger' : usingMock ? 'text-warning' : 'text-success'}`}>{statusIcon}{statusText}</span>
            <span className="hidden md:block text-xs text-muted font-mono">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <button type="button" onClick={() => refetch(true)} aria-label="Refresh dashboard" title="Refresh dashboard" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary hover:text-primary hover:border-strong flex items-center justify-center"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/></button>
          </div>
        </div>
      </header>

      {loading && !sessions.length ? <Skeleton/> : <main className="p-4 md:p-6 space-y-5">
        {error && <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 flex gap-3 text-danger"><WifiOff className="w-4 h-4 mt-0.5 shrink-0"/><div><p className="font-semibold text-sm">Live session data unavailable</p><p className="text-sm text-secondary mt-1">{error}</p></div></section>}

        <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div><h2 className="text-2xl font-bold text-primary">{clientName}</h2><p className="text-sm text-secondary mt-1">Workforce intelligence · {employees.length} employees · current telemetry window</p></div>
          <p className="text-sm text-muted">{sessions.length} total sessions on record</p>
        </section>

        <section aria-label="Key performance indicators" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard label="Workforce Health" value={health ? `${health}/100` : '—'} sub="Composite of productivity, focus, participation and active risk." icon={<Activity className="w-5 h-5"/>} tone={health >= 70 ? 'accent' : health >= 50 ? 'warning' : 'danger'} onClick={() => onSectionNavigate('workspace')}/>
          <MetricCard label="Active Workforce" value={`${activeToday} / ${employees.length}`} sub="Employees with activity recorded in the active window." icon={<Users className="w-5 h-5"/>} tone="success" onClick={() => onSectionNavigate('employees')}/>
          <MetricCard label="Deep Work Hours" value={deepWorkMinutes ? `${(deepWorkMinutes / 60).toFixed(1)}h` : '—'} sub="Evidence-backed deep work recorded across supporting sessions." icon={<BrainCircuit className="w-5 h-5"/>}/>
          <MetricCard label="Alerts / Risks" value={`${alerts.length}`} sub="Rule-generated signals requiring manager review and supporting evidence." icon={<AlertTriangle className="w-5 h-5"/>} tone={alerts.length ? 'danger' : 'success'} onClick={() => onSectionNavigate('alerts')}/>
        </section>

        <section className="grid xl:grid-cols-[1.35fr_.65fr] gap-4">
          <article className="bg-surface-card rounded-2xl p-5 shadow-card">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-accent"/><div><h3 className="font-semibold text-primary">AI Workforce Intelligence</h3><p className="text-xs text-muted mt-0.5">Deterministic summary from normalized telemetry</p></div></div>{alerts.length > 0 && <button type="button" onClick={() => onSectionNavigate('alerts')} className="text-sm text-danger hover:underline">View alerts →</button>}</div>
            <div className="grid md:grid-cols-3 gap-3 mt-5">{insights.map(item => <div key={item.title} className="bg-surface-raised border border-subtle rounded-xl p-4"><div className={`flex items-center gap-2 font-semibold text-sm ${item.tone}`}>{item.icon}{item.title}</div><p className="text-sm text-secondary leading-6 mt-2">{item.body}</p></div>)}</div>
          </article>

          <article className="bg-surface-card border border-subtle rounded-2xl p-5 shadow-card">
            <div className="flex items-center justify-between"><div><h3 className="font-semibold text-primary">Team Status</h3><p className="text-xs text-muted mt-1">Recent activity state</p></div><button type="button" onClick={() => onSectionNavigate('employees')} className="text-sm text-accent inline-flex items-center gap-1">View all <ArrowRight className="w-3.5 h-3.5"/></button></div>
            <div className="grid grid-cols-3 gap-2 mt-4">{(['working','idle','offline'] as EmployeeStatus[]).map(status => {const count=employees.filter(item => item.status === status).length;const tone=status==='working'?'text-success':status==='idle'?'text-warning':'text-muted';return <div key={status} className="bg-surface-raised border border-subtle rounded-xl p-3 text-center"><p className={`text-xs font-semibold capitalize ${tone}`}>{status}</p><p className="text-xl font-bold text-primary mt-1">{count}</p></div>})}</div>
            <div className="mt-4 space-y-1">{employees.filter(item => item.status !== 'offline').slice(0,4).map(item => <button key={item.employee.name} type="button" onClick={() => onEmployeeClick(item.employee)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover text-left"><span className={`w-2 h-2 rounded-full ${item.status==='working'?'bg-green-500':'bg-amber-500'}`}/><span className="min-w-0"><span className="block text-sm font-medium text-primary truncate">{item.employee.name}</span><span className="block text-xs text-muted truncate">{item.employee.role || 'Role not provided'}</span></span></button>)}</div>
          </article>
        </section>

        <section className="bg-surface-card border border-subtle rounded-2xl p-5 shadow-card">
          <div className="mb-4"><h3 className="font-semibold text-primary">Workforce Activity Timeline</h3><p className="text-sm text-muted mt-1">Active versus idle minutes by hour</p></div>
          <ResponsiveContainer width="100%" height={220}><BarChart data={hourly}><CartesianGrid stroke={CHART_GRID} vertical={false}/><XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip content={<ThemedTooltip/>}/><Bar dataKey="active" name="Active" stackId="time" fill={CHART_ACCENT}/><Bar dataKey="idle" name="Idle" stackId="time" fill={CHART_GRID}/></BarChart></ResponsiveContainer>
        </section>

        <section className="bg-surface-card border border-subtle rounded-2xl p-5 shadow-card">
          <div className="mb-4"><h3 className="font-semibold text-primary">Workforce Derived Metrics</h3><p className="text-sm text-muted mt-1">Calculated from normalized telemetry</p></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[
            ['Average productivity', `${avgScore || 0}/100`], ['Average focus', `${avgFocus || 0}/100`], ['Average idle', `${idlePct}%`], ['Tracked time', fmtMinutes(totalTracked)],
          ].map(([label,value]) => <div key={label} className="bg-surface-raised border border-subtle rounded-xl p-4"><p className="text-xs text-muted">{label}</p><p className="text-xl font-bold text-primary mt-2">{value}</p></div>)}</div>
        </section>

        <section className="grid xl:grid-cols-2 gap-4">
          <article className="bg-surface-card border border-subtle rounded-2xl p-5 shadow-card"><h3 className="font-semibold text-primary">Productivity Distribution</h3><p className="text-sm text-muted mt-1 mb-4">Average score per employee</p>{distribution.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={distribution}><CartesianGrid stroke={CHART_GRID} vertical={false}/><XAxis dataKey="name" tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis domain={[0,100]} tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip content={<ThemedTooltip/>}/><Bar dataKey="score" name="Productivity" radius={[5,5,0,0]} onClick={(row:any) => {const employee=employees.find(item=>item.employee.name===row.fullName);if(employee) onEmployeeClick(employee.employee)}}>{distribution.map(item => {const level=classifyScore(item.score).label;const fill=level==='Elite'?CHART_ACCENT:level==='Strong'?CHART_SUCCESS:level==='Moderate'?CHART_WARNING:CHART_DANGER;return <Cell key={item.fullName} fill={fill}/>})}</Bar></BarChart></ResponsiveContainer>:<div className="h-52 flex items-center justify-center text-muted">No productivity data available.</div>}</article>
          <article className="bg-surface-card border border-subtle rounded-2xl p-5 shadow-card"><h3 className="font-semibold text-primary">Weekly Trend</h3><p className="text-sm text-muted mt-1 mb-4">Productivity, focus and idle percentage</p><ResponsiveContainer width="100%" height={230}><LineChart data={trend}><CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3"/><XAxis dataKey="label" tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis domain={[0,100]} tick={{ fill: CHART_TEXT, fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip content={<ThemedTooltip/>}/><Line type="monotone" dataKey="productivity" name="Productivity" stroke={CHART_ACCENT} strokeWidth={2} connectNulls={false}/><Line type="monotone" dataKey="focus" name="Focus" stroke={CHART_SUCCESS} strokeWidth={2} connectNulls={false}/><Line type="monotone" dataKey="idle" name="Idle %" stroke={CHART_WARNING} strokeWidth={2} connectNulls={false}/></LineChart></ResponsiveContainer></article>
        </section>

        <section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden shadow-card">
          <div className="p-4 md:p-5 border-b border-subtle flex flex-wrap gap-3 items-center justify-between"><div><h3 className="font-semibold text-primary">Employee Performance</h3><p className="text-sm text-muted mt-1">Open an employee for supporting session evidence.</p></div><div className="flex gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"/><input value={search} onChange={event=>setSearch(event.target.value)} aria-label="Search employees" placeholder="Search employees…" className="bg-surface-input border border-subtle text-primary rounded-lg pl-9 pr-3 py-2 text-sm w-48 focus:border-accent"/></div><select value={sort} onChange={event=>setSort(event.target.value as typeof sort)} aria-label="Sort employees" className="bg-surface-input border border-subtle text-primary rounded-lg px-3 py-2 text-sm"><option value="risk">Risk</option><option value="score">Score</option><option value="name">Name</option></select></div></div>
          <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[1.4fr_100px_100px_100px_90px] gap-4 px-5 py-3 border-b border-subtle text-xs text-muted"><span>Employee</span><span>Score</span><span>Active</span><span>Idle</span><span>Risk</span></div>{filteredEmployees.map(item => <button key={item.employee.name} type="button" onClick={()=>onEmployeeClick(item.employee)} className="w-full grid grid-cols-[1.4fr_100px_100px_100px_90px] gap-4 items-center px-5 py-4 border-b border-subtle hover:bg-surface-hover text-left"><span className="min-w-0"><span className="block text-sm font-semibold text-primary truncate">{item.employee.name}</span><span className="block text-xs text-muted truncate mt-0.5">{item.employee.role || 'Role not provided'} · {item.sessions.length} sessions</span></span><span className="text-sm text-secondary">{item.score || '—'}</span><span className="text-sm text-secondary">{fmtMinutes(item.activeMinutes)}</span><span className="text-sm text-secondary">{item.idlePct}%</span><span className={`text-xs font-semibold capitalize ${item.risk==='high'?'text-danger':item.risk==='medium'?'text-warning':'text-success'}`}>{item.risk}</span></button>)}{!filteredEmployees.length&&<div className="p-10 text-center text-muted">No employees match the current search.</div>}</div></div>
        </section>
      </main>}
    </div>
  </div>;
};