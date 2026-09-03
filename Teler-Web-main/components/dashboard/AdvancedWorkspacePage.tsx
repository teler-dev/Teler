import React, { useMemo, useState } from 'react';
import { BarChart3, Download, FileText, ShieldCheck, Bell, SlidersHorizontal, ArrowUpDown, Plus, Trash2, AlertTriangle, X } from 'lucide-react';
import { Session } from '../../types';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { generateAlerts } from './alertUtils';
import { useSessions } from './useSessions';
import {
  DEFAULT_ENTERPRISE,
  EnterprisePreferences,
  getEnterprisePreferences,
  getNotificationRoutes,
  NotificationRoute,
  saveEnterprisePreferences,
  saveNotificationRoutes,
} from '../../services/workspaceService';

type Tab = 'analytics' | 'compare' | 'reports' | 'dashboard' | 'enterprise' | 'notifications';
const KPI_KEY = 'teler_dashboard_kpis';
const REPORT_KEY = 'teler_report_schedule';
const DEFAULT_KPIS = ['Workforce Health', 'Active Workforce', 'Deep Work Hours', 'Alerts / Risks', 'Focus Score', 'Idle Rate'];

function exportCsv(sessions: Session[]) {
  const rows = [['employee','role','team','session_id','created_at','minutes','productivity','focus','idle_minutes','context_switches'], ...sessions.map(s => [s.userName ?? '', s.role ?? '', s.client ?? '', s.id, s.created_at, s.total_minutes, s.overall_productivity_score, s.focus_score, s.idle_minutes_estimate, s.app_switches?.length ?? 0])];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `teler-report-${new Date().toISOString().slice(0,10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const AdvancedWorkspacePage: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { sessions, loading, error } = useSessions();
  const [tab, setTab] = useState<Tab>('analytics');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [enterprise, setEnterprise] = useState<EnterprisePreferences>(() => getEnterprisePreferences());
  const [routes, setRoutes] = useState<NotificationRoute[]>(() => getNotificationRoutes());
  const [kpis, setKpis] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(KPI_KEY) ?? JSON.stringify(DEFAULT_KPIS)); } catch { return DEFAULT_KPIS; } });
  const [schedule, setSchedule] = useState(() => localStorage.getItem(REPORT_KEY) ?? 'weekly');

  const employees = useMemo(() => [...new Set(sessions.map(s => s.userName || s.role).filter(Boolean) as string[])].sort(), [sessions]);
  const alerts = useMemo(() => generateAlerts(sessions), [sessions]);
  const summary = useMemo(() => ({
    sessions: sessions.length,
    employees: employees.length,
    avgScore: sessions.length ? Math.round(sessions.reduce((a,s) => a + s.overall_productivity_score, 0) / sessions.length) : 0,
    avgFocus: sessions.length ? Math.round(sessions.reduce((a,s) => a + s.focus_score, 0) / sessions.length) : 0,
    idlePct: sessions.reduce((a,s) => a + s.total_minutes,0) ? Math.round(sessions.reduce((a,s) => a + s.idle_minutes_estimate,0) / sessions.reduce((a,s) => a + s.total_minutes,0) * 100) : 0,
  }), [sessions, employees]);

  const statsFor = (name: string) => {
    const list = sessions.filter(s => (s.userName || s.role) === name);
    const total = list.reduce((a,s) => a + s.total_minutes,0);
    return { count:list.length, score:list.length ? Math.round(list.reduce((a,s)=>a+s.overall_productivity_score,0)/list.length):0, focus:list.length ? Math.round(list.reduce((a,s)=>a+s.focus_score,0)/list.length):0, idle:total ? Math.round(list.reduce((a,s)=>a+s.idle_minutes_estimate,0)/total*100):0, switches:list.reduce((a,s)=>a+(s.app_switches?.length??0),0) };
  };
  const a = statsFor(compareA), b = statsFor(compareB);
  const saveEnterprise = (next: EnterprisePreferences) => { setEnterprise(next); saveEnterprisePreferences(next); };
  const saveRoutes = (next: NotificationRoute[]) => { setRoutes(next); saveNotificationRoutes(next); };
  const saveKpis = (next: string[]) => { setKpis(next); localStorage.setItem(KPI_KEY, JSON.stringify(next)); };
  const openEmployee = (name: string) => { const session = sessions.find(s => (s.userName || s.role) === name); if (session) window.dispatchEvent(new CustomEvent('teler:open-employee', { detail: { name, role: session.role ?? '', client: session.client ?? '' } })); onClose(); };

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key:'analytics', label:'Drill-down', icon:<BarChart3 className="w-4 h-4" /> }, { key:'compare', label:'Compare', icon:<ArrowUpDown className="w-4 h-4" /> }, { key:'reports', label:'Reports', icon:<FileText className="w-4 h-4" /> }, { key:'dashboard', label:'Custom dashboard', icon:<SlidersHorizontal className="w-4 h-4" /> }, { key:'enterprise', label:'Enterprise', icon:<ShieldCheck className="w-4 h-4" /> }, { key:'notifications', label:'Notifications', icon:<Bell className="w-4 h-4" /> },
  ];

  return <div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="TELER Control Center">
    <div className="h-full max-w-6xl mx-auto bg-surface-page border border-subtle rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <header className="px-4 md:px-6 py-4 border-b border-subtle flex items-start justify-between gap-4"><div><h1 className="text-xl md:text-2xl font-bold text-primary">Control Center</h1><p className="text-sm text-secondary mt-1">Cross-team analysis, reporting, saved views, policy configuration and alert routing.</p></div><button type="button" onClick={onClose} aria-label="Close Control Center" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary flex items-center justify-center"><X className="w-4 h-4" /></button></header>
      <main className="p-4 md:p-6 space-y-5 overflow-y-auto min-h-0">
        <WorkspaceToolbar sessions={sessions} />
        {loading && <div className="h-20 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer" />}
        {error && <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-sm text-red-400">{error}</div>}
        <div className="flex gap-2 overflow-x-auto pb-1">{tabs.map(item => <button key={item.key} type="button" onClick={() => setTab(item.key)} className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${tab === item.key ? 'bg-accent/10 border-accent text-accent' : 'bg-surface-card border-subtle text-secondary hover:text-primary'}`}>{item.icon}{item.label}</button>)}</div>

        {tab === 'analytics' && <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]"><div className="grid grid-cols-2 gap-3">{[['Employees',summary.employees],['Sessions',summary.sessions],['Avg productivity',`${summary.avgScore}/100`],['Avg focus',`${summary.avgFocus}/100`],['Idle rate',`${summary.idlePct}%`],['Active alerts',alerts.length]].map(([label,value]) => <div key={label} className="bg-surface-card border border-subtle rounded-2xl p-4"><p className="text-sm text-secondary">{label}</p><p className="text-2xl font-bold mt-2 text-primary">{value}</p></div>)}</div><div className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="p-4 border-b border-subtle"><h2 className="font-semibold text-primary">Employee drill-down</h2><p className="text-sm text-secondary mt-1">Open the exact supporting sessions and evidence.</p></div>{employees.map(name => { const s=statsFor(name); return <button key={name} type="button" onClick={() => openEmployee(name)} className="w-full grid grid-cols-[1fr_auto_auto] gap-4 p-4 text-left border-b border-subtle hover:bg-surface-raised"><span><span className="block font-semibold text-primary">{name}</span><span className="text-xs text-secondary">{s.count} supporting sessions</span></span><span className="text-sm text-primary"><b>{s.score}</b> score</span><span className="text-sm text-primary"><b>{s.idle}%</b> idle</span></button>})}</div></section>}

        {tab === 'compare' && <section className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex flex-wrap gap-3 mb-5"><select aria-label="First employee" value={compareA} onChange={e=>setCompareA(e.target.value)} className="bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-sm text-primary"><option value="">Select first employee</option>{employees.map(n=><option key={n}>{n}</option>)}</select><select aria-label="Second employee" value={compareB} onChange={e=>setCompareB(e.target.value)} className="bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-sm text-primary"><option value="">Select comparison employee</option>{employees.map(n=><option key={n}>{n}</option>)}</select></div>{compareA&&compareB?<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-secondary border-b border-subtle"><th className="text-left py-3">Metric</th><th className="text-right">{compareA}</th><th className="text-right">{compareB}</th><th className="text-right">Delta</th></tr></thead><tbody>{[['Sessions',a.count,b.count],['Productivity',a.score,b.score],['Focus',a.focus,b.focus],['Idle %',a.idle,b.idle],['Context switches',a.switches,b.switches]].map(([label,av,bv])=><tr key={String(label)} className="border-b border-subtle"><td className="py-3 text-primary">{label}</td><td className="text-right">{av}</td><td className="text-right">{bv}</td><td className="text-right font-semibold">{Number(av)-Number(bv)>0?'+':''}{Number(av)-Number(bv)}</td></tr>)}</tbody></table></div>:<p className="text-sm text-secondary">Choose two people to compare sessions, productivity, focus, idle rate and context switching.</p>}</section>}

        {tab === 'reports' && <section className="grid gap-4 lg:grid-cols-2"><div className="bg-surface-card border border-subtle rounded-2xl p-5"><h2 className="font-semibold text-primary">Executive export</h2><p className="text-sm text-secondary mt-1 mb-4">Export filtered telemetry or use the browser print dialog for PDF output.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>exportCsv(sessions)} className="px-4 py-2 rounded-lg bg-accent text-white text-sm flex gap-2 items-center"><Download className="w-4 h-4" />Export CSV</button><button type="button" onClick={()=>window.print()} className="px-4 py-2 rounded-lg bg-surface-raised border border-subtle text-primary text-sm"><FileText className="w-4 h-4 inline mr-2" />Print / PDF</button></div></div><div className="bg-surface-card border border-subtle rounded-2xl p-5"><h2 className="font-semibold text-primary">Scheduled summaries</h2><p className="text-sm text-secondary mt-1">Cadence is persisted; actual email delivery remains inactive until a mail worker endpoint is connected.</p><select value={schedule} onChange={e=>{setSchedule(e.target.value);localStorage.setItem(REPORT_KEY,e.target.value)}} className="mt-4 bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-sm text-primary"><option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div></section>}

        {tab === 'dashboard' && <section className="bg-surface-card border border-subtle rounded-2xl p-5"><h2 className="font-semibold text-primary">Custom dashboard</h2><p className="text-sm text-secondary mt-1 mb-4">Choose and prioritize KPI cards. Layout is persisted per browser.</p><div className="space-y-2">{kpis.map((kpi,index)=><div key={kpi} className="flex items-center gap-3 p-3 bg-surface-raised border border-subtle rounded-xl"><span className="w-6 text-secondary text-xs">{index+1}</span><span className="flex-1 font-medium text-sm text-primary">{kpi}</span><button type="button" disabled={index===0} aria-label={`Move ${kpi} up`} onClick={()=>{const next=[...kpis];[next[index-1],next[index]]=[next[index],next[index-1]];saveKpis(next)}} className="text-secondary disabled:opacity-30">↑</button><button type="button" disabled={index===kpis.length-1} aria-label={`Move ${kpi} down`} onClick={()=>{const next=[...kpis];[next[index+1],next[index]]=[next[index],next[index+1]];saveKpis(next)}} className="text-secondary disabled:opacity-30">↓</button><button type="button" aria-label={`Remove ${kpi}`} onClick={()=>saveKpis(kpis.filter(x=>x!==kpi))} className="text-secondary hover:text-danger"><Trash2 className="w-4 h-4" /></button></div>)}</div><div className="flex flex-wrap gap-2 mt-4">{DEFAULT_KPIS.filter(k=>!kpis.includes(k)).map(kpi=><button key={kpi} type="button" onClick={()=>saveKpis([...kpis,kpi])} className="text-xs px-3 py-2 rounded-lg border border-subtle bg-surface-raised text-primary"><Plus className="w-3 h-3 inline mr-1" />{kpi}</button>)}</div></section>}

        {tab === 'enterprise' && <section className="grid gap-4 lg:grid-cols-2"><div className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex gap-2 items-center"><AlertTriangle className="w-4 h-4 text-warning" /><h2 className="font-semibold text-primary">Enterprise policy preferences</h2></div><p className="text-sm text-secondary mt-2 mb-4">The repository has multitenant RBAC, retention and audit tables, but this Vercel API has no enforcement endpoint. These settings are configuration-ready preferences, not a claim of active SSO/RBAC enforcement.</p>{([['mfaRequired','Require MFA'],['ssoRequired','Require SSO'],['employeeConsentRequired','Require employee consent'],['redactSensitiveData','Redact sensitive data'],['auditLogging','Audit logging']] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-3 py-3 border-b border-subtle"><span className="text-sm text-primary">{label}</span><input type="checkbox" checked={enterprise[key]} onChange={e=>saveEnterprise({...enterprise,[key]:e.target.checked})} className="w-4 h-4 accent-cyan-500" /></label>)}</div><div className="bg-surface-card border border-subtle rounded-2xl p-5"><h2 className="font-semibold text-primary">Retention policy</h2><label className="block mt-4 text-sm text-primary">Raw telemetry retention<input type="number" min={1} max={3650} value={enterprise.rawRetentionDays} onChange={e=>saveEnterprise({...enterprise,rawRetentionDays:Number(e.target.value)||DEFAULT_ENTERPRISE.rawRetentionDays})} className="block mt-2 w-full bg-surface-raised border border-subtle rounded-lg px-3 py-2" /></label><label className="block mt-4 text-sm text-primary">Screenshot retention<input type="number" min={1} max={3650} value={enterprise.screenshotRetentionDays} onChange={e=>saveEnterprise({...enterprise,screenshotRetentionDays:Number(e.target.value)||DEFAULT_ENTERPRISE.screenshotRetentionDays})} className="block mt-2 w-full bg-surface-raised border border-subtle rounded-lg px-3 py-2" /></label></div></section>}

        {tab === 'notifications' && <section className="bg-surface-card border border-subtle rounded-2xl p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-primary">Notification routing</h2><p className="text-sm text-secondary mt-1">Configure Slack, Teams, email or webhook destinations. Live delivery stays explicitly inactive without a server notification worker.</p></div><button type="button" aria-label="Add notification route" onClick={()=>saveRoutes([...routes,{id:crypto.randomUUID(),channel:'email',destination:'',minimumSeverity:'high',enabled:false}])} className="w-9 h-9 rounded-lg bg-accent text-white"><Plus className="w-4 h-4 mx-auto" /></button></div><div className="space-y-3 mt-5">{routes.length===0&&<div className="text-sm text-secondary py-6 text-center border border-dashed border-subtle rounded-xl">No notification routes configured.</div>}{routes.map(route=><div key={route.id} className="grid gap-2 md:grid-cols-[120px_1fr_120px_auto_auto] items-center p-3 bg-surface-raised border border-subtle rounded-xl"><select aria-label="Notification channel" value={route.channel} onChange={e=>saveRoutes(routes.map(r=>r.id===route.id?{...r,channel:e.target.value as NotificationRoute['channel']}:r))} className="bg-surface-card border border-subtle rounded-lg px-2 py-2 text-sm"><option value="email">Email</option><option value="slack">Slack</option><option value="teams">Teams</option><option value="webhook">Webhook</option></select><input aria-label="Notification destination" value={route.destination} onChange={e=>saveRoutes(routes.map(r=>r.id===route.id?{...r,destination:e.target.value}:r))} placeholder="Destination" className="min-w-0 bg-surface-card border border-subtle rounded-lg px-3 py-2 text-sm" /><select aria-label="Minimum severity" value={route.minimumSeverity} onChange={e=>saveRoutes(routes.map(r=>r.id===route.id?{...r,minimumSeverity:e.target.value as NotificationRoute['minimumSeverity']}:r))} className="bg-surface-card border border-subtle rounded-lg px-2 py-2 text-sm"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><label className="flex items-center gap-2 text-xs text-primary"><input type="checkbox" checked={route.enabled} onChange={e=>saveRoutes(routes.map(r=>r.id===route.id?{...r,enabled:e.target.checked}:r))} />Enabled</label><button type="button" aria-label="Delete route" onClick={()=>saveRoutes(routes.filter(r=>r.id!==route.id))} className="text-secondary hover:text-danger"><Trash2 className="w-4 h-4" /></button></div>)}</div></section>}
      </main>
    </div>
  </div>;
};