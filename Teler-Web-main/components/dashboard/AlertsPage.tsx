import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, RefreshCw, ShieldCheck, WifiOff, X } from 'lucide-react';
import { Employee } from '../../types';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { Alert, AlertSeverity, ALERT_DESCRIPTION, ALERT_LABEL, generateAlerts, SEVERITY_CONFIG, SEVERITY_ORDER } from './alertUtils';
import { AlertWorkflowPanel } from './AlertWorkflowPanel';
import { useSessions } from './useSessions';
import { alertPath, employeePath, navigate, sessionPath, updateQuery } from '../../services/routerService';

interface Props { onLogout:()=>void; onEmployeeClick:(emp:Employee)=>void; onSectionNavigate:(section:NavSection)=>void; clientName?:string; }

const severityOptions:Array<AlertSeverity|'all'>=['all','critical','high','medium','low'];
const typeOptions:Array<Alert['alertType']|'all'>=['all','low_focus','high_idle','high_context_switch','suspicious_inactivity'];

const QuickPreview:React.FC<{alert:Alert|null;onClose:()=>void}>=({alert,onClose})=>{
  if(!alert)return null;
  const config=SEVERITY_CONFIG[alert.severity];
  return <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label={`Quick preview: ${alert.alertLabel}`}>
    <button type="button" aria-label="Close alert preview" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm"/>
    <aside className="relative w-full max-w-md h-full bg-surface-page border-l border-subtle shadow-2xl flex flex-col">
      <header className="p-5 border-b border-subtle flex items-start justify-between gap-3"><div><p className={`text-xs font-semibold uppercase ${config.color}`}>{alert.severity}</p><h2 className="font-bold text-lg mt-1">{alert.alertLabel}</h2><p className="text-sm text-secondary mt-1">{alert.employeeName}</p></div><button type="button" onClick={onClose} aria-label="Close alert preview" title="Close" className="w-9 h-9 rounded-lg border border-subtle bg-surface-raised text-secondary flex items-center justify-center"><X className="w-4 h-4"/></button></header>
      <div className="flex-1 overflow-y-auto p-5 space-y-4"><section className="bg-surface-card border border-subtle rounded-xl p-4"><p className="text-xs text-secondary">Detected metric</p><p className="font-semibold mt-2">{alert.details}</p><p className="text-xs text-secondary mt-3">{new Date(alert.timestamp).toLocaleString()}</p></section><section className="bg-surface-card border border-subtle rounded-xl p-4"><p className="text-xs text-secondary">Recommended context</p><p className="text-sm leading-6 mt-2">{ALERT_DESCRIPTION[alert.alertType]}</p></section><AlertWorkflowPanel alertId={alert.id}/></div>
      <footer className="p-4 border-t border-subtle space-y-2"><a href={alertPath(alert.id)} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onClose();navigate(alertPath(alert.id))}}} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold">Open full alert <ChevronRight className="w-4 h-4"/></a><div className="grid grid-cols-2 gap-2"><a href={employeePath(alert.employeeName)} className="text-center px-3 py-2 rounded-lg border border-subtle bg-surface-raised text-xs">Employee</a><a href={sessionPath(alert.employeeName,alert.sessionId)} className="text-center px-3 py-2 rounded-lg border border-subtle bg-surface-raised text-xs">Session</a></div></footer>
    </aside>
  </div>;
};

export const AlertsPage:React.FC<Props>=({onLogout,onEmployeeClick,onSectionNavigate,clientName='Your Company'})=>{
  const {sessions,loading,error,refetch}=useSessions();
  const params=useMemo(()=>new URLSearchParams(window.location.search),[]);
  const [severity,setSeverity]=useState<AlertSeverity|'all'>(()=>{const value=params.get('severity');return severityOptions.includes(value as any)?value as AlertSeverity|'all':'all'});
  const [type,setType]=useState<Alert['alertType']|'all'>(()=>{const value=params.get('type');return typeOptions.includes(value as any)?value as Alert['alertType']|'all':'all'});
  const [group,setGroup]=useState(params.get('view')==='employee');
  const [selected,setSelected]=useState<Alert|null>(null);
  const alerts=useMemo(()=>generateAlerts(sessions),[sessions]);
  const filtered=useMemo(()=>alerts.filter(alert=>(severity==='all'||alert.severity===severity)&&(type==='all'||alert.alertType===type)).sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]||new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()),[alerts,severity,type]);
  const grouped=useMemo(()=>{const map=new Map<string,Alert[]>();filtered.forEach(alert=>map.set(alert.employeeName,[...(map.get(alert.employeeName)||[]),alert]));return [...map.entries()]},[filtered]);

  useEffect(()=>{updateQuery({severity:severity==='all'?null:severity,type:type==='all'?null:type,view:group?'employee':null});},[severity,type,group]);
  useEffect(()=>{const sync=()=>{const p=new URLSearchParams(window.location.search),s=p.get('severity'),t=p.get('type');setSeverity(severityOptions.includes(s as any)?s as AlertSeverity|'all':'all');setType(typeOptions.includes(t as any)?t as Alert['alertType']|'all':'all');setGroup(p.get('view')==='employee')};window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync)},[]);

  const openPreview=(event:React.MouseEvent<HTMLAnchorElement>,alert:Alert)=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setSelected(alert)};

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <style>{`
      :root[data-theme="light"] .teler-alert-summary{box-shadow:0 6px 18px rgba(15,23,42,.06)}
      :root[data-theme="light"] .teler-alert-summary-critical{background:#ffe4e6!important;border-color:#fda4af!important}
      :root[data-theme="light"] .teler-alert-summary-critical :is(p,span){color:#be123c!important}
      :root[data-theme="light"] .teler-alert-summary-high{background:#ffedd5!important;border-color:#fdba74!important}
      :root[data-theme="light"] .teler-alert-summary-high :is(p,span){color:#c2410c!important}
      :root[data-theme="light"] .teler-alert-summary-medium{background:#fef3c7!important;border-color:#facc15!important}
      :root[data-theme="light"] .teler-alert-summary-medium :is(p,span){color:#a16207!important}
      :root[data-theme="light"] .teler-alert-summary-low{background:#dcfce7!important;border-color:#86efac!important}
      :root[data-theme="light"] .teler-alert-summary-low :is(p,span){color:#15803d!important}
      :root[data-theme="light"] .teler-alert-filter{background:#f8fafc!important;border-color:#cbd5e1!important;color:#475569!important}
      :root[data-theme="light"] .teler-alert-filter:hover{background:#f1f5f9!important;border-color:#94a3b8!important;color:#0f172a!important}
      :root[data-theme="light"] .teler-alert-filter.is-active{background:#ecfdf5!important;border-color:#0f766e!important;color:#0f766e!important}
      :root[data-theme="light"] .teler-alert-select{background:#f8fafc!important;border-color:#cbd5e1!important;color:#0f172a!important}
      :root[data-theme="light"] .teler-alert-segmented{background:#fff!important;border-color:#cbd5e1!important}
      :root[data-theme="light"] .teler-alert-segment{background:#fff!important;color:#475569!important}
      :root[data-theme="light"] .teler-alert-segment.is-active{background:#ecfdf5!important;color:#0f766e!important}
      :root[data-theme="light"] .teler-alert-row{background:#fff!important}
      :root[data-theme="light"] .teler-alert-row:hover{background:#f8fafc!important}
    `}</style>
    <DashboardSidebar activeSection="alerts" onNavigate={onSectionNavigate} alertCount={alerts.length} onLogout={onLogout} clientName={clientName}/>
    <div className="flex-1 ml-56 min-w-0 min-h-screen">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle"><div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3"><div><h1 className="text-xl md:text-2xl font-bold">Alerts</h1><p className="text-sm text-secondary mt-1">{alerts.length} active alerts · quick preview or open a full shareable investigation.</p></div><button type="button" onClick={()=>refetch(true)} aria-label="Refresh alerts" title="Refresh alerts" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary flex items-center justify-center"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button></div></header>
      <main className="p-4 md:p-6 space-y-5">
        {error&&<div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm flex gap-2"><WifiOff className="w-4 h-4 shrink-0 mt-0.5"/>{error}</div>}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">{(['critical','high','medium','low'] as AlertSeverity[]).map(level=>{const config=SEVERITY_CONFIG[level],count=alerts.filter(alert=>alert.severity===level).length;return <button key={level} type="button" onClick={()=>setSeverity(severity===level?'all':level)} className={`teler-alert-summary teler-alert-summary-${level} p-4 rounded-2xl border text-left ${config.bg} ${config.border} ${severity===level?'ring-1 ring-white/20':''}`}><p className={`text-xs font-semibold uppercase ${config.color}`}>{level}</p><p className={`text-2xl font-bold mt-2 ${config.color}`}>{count}</p></button>})}</section>
        <section className="bg-surface-card border border-subtle rounded-2xl p-4 flex flex-wrap gap-3 items-center"><div className="flex flex-wrap gap-2">{severityOptions.map(value=><button key={value} type="button" onClick={()=>setSeverity(value)} className={`teler-alert-filter ${severity===value?'is-active':''} px-3 py-2 rounded-lg border text-xs ${severity===value?'border-accent bg-accent/10 text-accent':'border-subtle bg-surface-raised text-secondary'}`}>{value==='all'?'All severities':value}</button>)}</div><select aria-label="Alert type" value={type} onChange={event=>setType(event.target.value as Alert['alertType']|'all')} className="teler-alert-select bg-surface-raised border border-subtle rounded-lg px-3 py-2 text-xs"><option value="all">All alert types</option>{typeOptions.filter(value=>value!=='all').map(value=><option key={value} value={value}>{ALERT_LABEL[value as Alert['alertType']]}</option>)}</select><div className="teler-alert-segmented ml-auto flex rounded-lg border border-subtle overflow-hidden"><button type="button" onClick={()=>setGroup(false)} className={`teler-alert-segment ${!group?'is-active':''} px-3 py-2 text-xs ${!group?'bg-accent/10 text-accent':'text-secondary'}`}>All alerts</button><button type="button" onClick={()=>setGroup(true)} className={`teler-alert-segment ${group?'is-active':''} px-3 py-2 text-xs ${group?'bg-accent/10 text-accent':'text-secondary'}`}>By employee</button></div></section>
        {loading&&!alerts.length?<div className="space-y-3">{[0,1,2,3].map(i=><div key={i} className="h-20 rounded-2xl bg-surface-card border border-subtle skeleton-shimmer animate-shimmer"/>)}</div>:!filtered.length?<div className="bg-surface-card border border-subtle rounded-2xl p-10 text-center"><ShieldCheck className="w-7 h-7 text-green-400 mx-auto"/><p className="text-sm text-secondary mt-3">No alerts match the current URL filters.</p></div>:group?<div className="space-y-4">{grouped.map(([employee,items])=><section key={employee} className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="p-4 border-b border-subtle flex items-center justify-between"><a href={employeePath(employee)} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onEmployeeClick({name:employee,role:items[0]?.employeeRole??'',client:''})}}} className="font-semibold hover:text-accent">{employee}</a><span className="text-xs text-secondary">{items.length} alerts</span></div>{items.map(alert=><AlertRow key={alert.id} alert={alert} onPreview={openPreview}/>)}</section>)}</div>:<section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden">{filtered.map(alert=><AlertRow key={alert.id} alert={alert} onPreview={openPreview}/>)}</section>}
      </main>
    </div>
    <QuickPreview alert={selected} onClose={()=>setSelected(null)}/>
  </div>;
};

const AlertRow:React.FC<{alert:Alert;onPreview:(event:React.MouseEvent<HTMLAnchorElement>,alert:Alert)=>void}>=({alert,onPreview})=>{const config=SEVERITY_CONFIG[alert.severity],href=alertPath(alert.id);return <a href={href} onClick={event=>onPreview(event,alert)} className="teler-alert-row grid md:grid-cols-[90px_1.3fr_1fr_120px] gap-3 items-center p-4 border-b border-subtle hover:bg-surface-raised group"><span className={`text-xs font-semibold uppercase ${config.color}`}>{alert.severity}</span><span><span className="block font-semibold text-sm group-hover:text-accent">{alert.employeeName} · {alert.alertLabel}</span><span className="block text-xs text-secondary mt-0.5">{alert.employeeRole||ALERT_LABEL[alert.alertType]}</span></span><span className="text-sm text-secondary">{alert.details}</span><span className="text-xs text-secondary">{new Date(alert.timestamp).toLocaleDateString()}</span></a>};