import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Employee } from '../../types';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { Alert, AlertSeverity, ALERT_DESCRIPTION, ALERT_LABEL, generateAlerts, SEVERITY_CONFIG, SEVERITY_ORDER } from './alertUtils';
import { AlertWorkflowPanel } from './AlertWorkflowPanel';
import { useSessions } from './useSessions';
import { alertPath, employeePath, navigate, sessionPath, updateQuery } from '../../services/routerService';
import { PageHeader } from '../ui/PageHeader';
import { IconButton } from '../ui/IconButton';
import { InlineAlert } from '../ui/InlineAlert';
import { EmptyState, PageContainer } from '../ui/AnalyticsLayout';
import { OverlaySurface } from '../ui/Overlay';
import { LoadingState } from '../ui/LoadingState';

interface Props { onLogout:()=>void; onEmployeeClick:(emp:Employee)=>void; onSectionNavigate:(section:NavSection)=>void; clientName?:string; }

const severityOptions:Array<AlertSeverity|'all'>=['all','critical','high','medium','low'];
const typeOptions:Array<Alert['alertType']|'all'>=['all','low_focus','high_idle','high_context_switch','suspicious_inactivity'];

const QuickPreview:React.FC<{alert:Alert|null;onClose:()=>void}>=({alert,onClose})=>{
  if(!alert)return null;
  const config=SEVERITY_CONFIG[alert.severity];
  return <OverlaySurface label={`Quick preview: ${alert.alertLabel}`} onClose={onClose} kind="drawer" flush className="w-full max-w-md h-full bg-surface-card border-l border-subtle shadow-2xl flex flex-col">
    <header className="p-5 border-b border-subtle flex items-start justify-between gap-3"><div><p className={`text-xs font-semibold uppercase ${config.color}`}>{alert.severity}</p><h2 className="font-bold text-lg mt-1">{alert.alertLabel}</h2><p className="text-sm text-secondary mt-1">{alert.employeeName}</p></div><IconButton label="Close alert preview" size="sm" onClick={onClose}><X className="w-4 h-4"/></IconButton></header>
    <div className="flex-1 overflow-y-auto p-5 space-y-4"><section className="bg-surface-card border border-subtle rounded-xl p-4"><p className="text-xs text-secondary">Detected metric</p><p className="font-semibold mt-2">{alert.details}</p><p className="text-xs text-secondary mt-3">{new Date(alert.timestamp).toLocaleString()}</p></section><section className="bg-surface-card border border-subtle rounded-xl p-4"><p className="text-xs text-secondary">Recommended context</p><p className="text-sm leading-6 mt-2">{ALERT_DESCRIPTION[alert.alertType]}</p></section><AlertWorkflowPanel alertId={alert.id}/></div>
    <footer className="p-4 border-t border-subtle space-y-2"><a href={alertPath(alert.id)} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onClose();navigate(alertPath(alert.id))}}} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold">Open full alert <ChevronRight className="w-4 h-4"/></a><div className="grid grid-cols-2 gap-2"><a href={employeePath(alert.employeeName)} className="text-center px-3 py-2 rounded-xl border border-subtle bg-surface-raised text-xs hover:bg-surface-hover transition-colors">Employee</a><a href={sessionPath(alert.employeeName,alert.sessionId)} className="text-center px-3 py-2 rounded-xl border border-subtle bg-surface-raised text-xs hover:bg-surface-hover transition-colors">Session</a></div></footer>
  </OverlaySurface>;
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

    <DashboardSidebar activeSection="alerts" onNavigate={onSectionNavigate} alertCount={alerts.length} onLogout={onLogout} clientName={clientName}/>
    <div className="flex-1 ml-56 min-w-0 min-h-screen">
      <PageHeader
        eyebrow="Workforce Intelligence"
        title="Alerts"
        meta={loading && !alerts.length ? 'Loading alerts…' : `${alerts.length} active alert${alerts.length===1?'':'s'} · review severity, evidence and ownership`}
        actions={<IconButton label="Refresh alerts" onClick={()=>refetch(true)}><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></IconButton>}
      />
      <PageContainer>
        {error&&<InlineAlert tone="danger" title="Alert data unavailable">{error}</InlineAlert>}
        {alerts.length > 0 && <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">{(['critical','high','medium','low'] as AlertSeverity[]).map(level=>{const config=SEVERITY_CONFIG[level],count=alerts.filter(alert=>alert.severity===level).length;return <button key={level} type="button" onClick={()=>setSeverity(severity===level?'all':level)} className={`teler-alert-summary teler-alert-summary-${level} p-4 md:p-5 rounded-2xl border text-left ${config.bg} ${config.border} ${severity===level?'ring-2 ring-accent':''}`}><p className={`text-xs font-semibold uppercase ${config.color}`}>{level}</p><p className={`text-2xl font-bold mt-2 ${config.color}`}>{count}</p></button>})}</section>
          <section className="bg-surface-card border border-subtle rounded-2xl p-4 flex flex-col lg:flex-row gap-3 lg:items-center"><div className="flex flex-wrap gap-2">{severityOptions.map(value=><button key={value} type="button" onClick={()=>setSeverity(value)} className={`teler-alert-filter ${severity===value?'is-active':''} px-3 py-2 rounded-lg border text-xs ${severity===value?'border-accent bg-accent/10 text-accent':'border-subtle bg-surface-raised text-secondary'}`}>{value==='all'?'All severities':value}</button>)}</div><select aria-label="Alert type" value={type} onChange={event=>setType(event.target.value as Alert['alertType']|'all')} className="teler-alert-select bg-surface-raised border border-subtle rounded-xl px-3 py-2.5 text-xs w-full sm:w-auto"><option value="all">All alert types</option>{typeOptions.filter(value=>value!=='all').map(value=><option key={value} value={value}>{ALERT_LABEL[value as Alert['alertType']]}</option>)}</select><div className="teler-alert-segmented flex w-full sm:w-auto lg:ml-auto rounded-xl border border-subtle overflow-hidden"><button type="button" onClick={()=>setGroup(false)} className={`teler-alert-segment ${!group?'is-active':''} flex-1 sm:flex-none px-3 py-2.5 text-xs ${!group?'bg-accent/10 text-accent':'text-secondary'}`}>All alerts</button><button type="button" onClick={()=>setGroup(true)} className={`teler-alert-segment ${group?'is-active':''} flex-1 sm:flex-none px-3 py-2.5 text-xs ${group?'bg-accent/10 text-accent':'text-secondary'}`}>By employee</button></div></section>
        </>}
        {loading&&!alerts.length?<LoadingState rows={4} label="Loading alerts" />:!alerts.length?<EmptyState icon={<ShieldCheck className="w-5 h-5 text-success"/>} title="All clear" description="There are no active alerts right now. Filters will appear automatically when there is something to review." />:!filtered.length?<EmptyState icon={<ShieldCheck className="w-5 h-5 text-success"/>} title="No alerts in this view" description="No alerts match the current filters." />:group?<div className="space-y-4">{grouped.map(([employee,items])=><section key={employee} className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="p-4 border-b border-subtle flex items-center justify-between"><a href={employeePath(employee)} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onEmployeeClick({name:employee,role:items[0]?.employeeRole??'',client:''})}}} className="font-semibold hover:text-accent">{employee}</a><span className="text-xs text-secondary">{items.length} alerts</span></div>{items.map(alert=><AlertRow key={alert.id} alert={alert} onPreview={openPreview}/>)}</section>)}</div>:<section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden">{filtered.map(alert=><AlertRow key={alert.id} alert={alert} onPreview={openPreview}/>)}</section>}
      </PageContainer>
    </div>
    <QuickPreview alert={selected} onClose={()=>setSelected(null)}/>
  </div>;
};

const AlertRow:React.FC<{alert:Alert;onPreview:(event:React.MouseEvent<HTMLAnchorElement>,alert:Alert)=>void}>=({alert,onPreview})=>{const config=SEVERITY_CONFIG[alert.severity],href=alertPath(alert.id);return <a href={href} onClick={event=>onPreview(event,alert)} className="teler-alert-row grid md:grid-cols-[90px_1.3fr_1fr_120px] gap-3 md:gap-4 items-center p-4 md:px-5 border-b border-subtle hover:bg-surface-raised group transition-colors"><span className={`text-xs font-semibold uppercase ${config.color}`}>{alert.severity}</span><span><span className="block font-semibold text-sm group-hover:text-accent">{alert.employeeName} · {alert.alertLabel}</span><span className="block text-xs text-secondary mt-0.5">{alert.employeeRole||ALERT_LABEL[alert.alertType]}</span></span><span className="text-sm text-secondary">{alert.details}</span><span className="text-xs text-secondary">{new Date(alert.timestamp).toLocaleDateString()}</span></a>};