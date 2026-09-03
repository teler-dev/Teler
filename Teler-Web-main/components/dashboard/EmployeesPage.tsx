import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Search, WifiOff } from 'lucide-react';
import { Employee, Session, classifyScore } from '../../types';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { generateAlerts, alertsForEmployee } from './alertUtils';
import { useSessions } from './useSessions';
import { employeePath, navigate, updateQuery } from '../../services/routerService';

interface Props { onLogout:()=>void; onEmployeeClick:(emp:Employee)=>void; onSectionNavigate:(section:NavSection)=>void; clientName?:string; }
type EmployeeStatus='working'|'idle'|'offline';
interface Row { employee:Employee; avgScore:number; sessions:number; status:EmployeeStatus; lastSeen:string|null; alertCount:number; }
const STATUS_LABEL:Record<EmployeeStatus,string>={working:'Working',idle:'Idle',offline:'Offline'};
const STATUS_CLASS:Record<EmployeeStatus,string>={working:'text-green-400',idle:'text-amber-400',offline:'text-gray-500'};
const STATUS_DOT:Record<EmployeeStatus,string>={working:'bg-green-400',idle:'bg-amber-400',offline:'bg-gray-600'};

function statusFor(value:string|null):EmployeeStatus{if(!value)return'offline';const age=Date.now()-new Date(value).getTime();return age<10*60_000?'working':age<30*60_000?'idle':'offline'}
function timeAgo(value:string|null){if(!value)return'Never';const min=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60_000));if(min<1)return'Just now';if(min<60)return`${min}m ago`;const hours=Math.floor(min/60);return hours<24?`${hours}h ago`:`${Math.floor(hours/24)}d ago`}
function buildRows(sessions:Session[]):Row[]{
  const alerts=generateAlerts(sessions), map=new Map<string,Session[]>();
  sessions.forEach(session=>{const name=session.userName||session.role||'Unknown';map.set(name,[...(map.get(name)||[]),session])});
  return [...map.entries()].map(([name,list])=>{const latest=[...list].sort((a,b)=>new Date(b.session_end||b.created_at).getTime()-new Date(a.session_end||a.created_at).getTime())[0];const scores=list.map(s=>s.overall_productivity_score).filter(score=>score>0);const employee={name,role:latest?.role??'',client:latest?.client??''};return{employee,avgScore:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0,sessions:list.length,status:statusFor(latest?.session_end||latest?.created_at||null),lastSeen:latest?.session_end||latest?.created_at||null,alertCount:alertsForEmployee(alerts,name).length}}).sort((a,b)=>b.alertCount-a.alertCount||b.avgScore-a.avgScore);
}

export const EmployeesPage:React.FC<Props>=({onLogout,onEmployeeClick,onSectionNavigate,clientName='Your Company'})=>{
  const {sessions,loading,error,refetch}=useSessions();
  const initialParams=useMemo(()=>new URLSearchParams(window.location.search),[]);
  const [search,setSearch]=useState(initialParams.get('q')||'');
  const [statusFilter,setStatusFilter]=useState<EmployeeStatus|'all'>(()=>{const value=initialParams.get('status');return value==='working'||value==='idle'||value==='offline'?value:'all'});
  const rows=useMemo(()=>buildRows(sessions),[sessions]);
  const allAlerts=useMemo(()=>generateAlerts(sessions),[sessions]);
  const filtered=useMemo(()=>rows.filter(row=>{if(statusFilter!=='all'&&row.status!==statusFilter)return false;const q=search.trim().toLowerCase();return !q||`${row.employee.name} ${row.employee.role} ${row.employee.client}`.toLowerCase().includes(q)}),[rows,search,statusFilter]);
  const counts=useMemo(()=>({working:rows.filter(r=>r.status==='working').length,idle:rows.filter(r=>r.status==='idle').length,offline:rows.filter(r=>r.status==='offline').length}),[rows]);

  useEffect(()=>{updateQuery({q:search||null,status:statusFilter==='all'?null:statusFilter});},[search,statusFilter]);
  useEffect(()=>{const onPop=()=>{const p=new URLSearchParams(window.location.search);setSearch(p.get('q')||'');const value=p.get('status');setStatusFilter(value==='working'||value==='idle'||value==='offline'?value:'all')};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);

  const open=(event:React.MouseEvent<HTMLAnchorElement>,employee:Employee)=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onEmployeeClick(employee)};

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection="employees" onNavigate={onSectionNavigate} alertCount={allAlerts.length} onLogout={onLogout} clientName={clientName}/>
    <div className="flex-1 ml-56 min-w-0 min-h-screen">
      <header className="sticky top-0 z-30 bg-surface-page/90 backdrop-blur-xl border-b border-subtle"><div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3"><div><h1 className="text-xl md:text-2xl font-bold">Employees</h1><p className="text-sm text-secondary mt-1">{rows.length} team members · {counts.working} working · {counts.idle} idle · {counts.offline} offline</p></div><button type="button" onClick={()=>refetch(true)} aria-label="Refresh employees" title="Refresh employees" className="w-10 h-10 rounded-lg border border-subtle bg-surface-raised text-secondary flex items-center justify-center"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button></div></header>
      <main className="p-4 md:p-6 space-y-5">
        {error&&<div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm flex gap-2"><WifiOff className="w-4 h-4 shrink-0 mt-0.5"/>{error}</div>}
        <div className="bg-surface-card border border-subtle rounded-2xl p-4 flex flex-wrap gap-3 items-center"><div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary"/><input aria-label="Search employees" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search employees, roles or teams…" className="w-full bg-surface-raised border border-subtle rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-accent"/></div><div className="flex flex-wrap gap-2">{(['all','working','idle','offline'] as const).map(status=><button key={status} type="button" onClick={()=>setStatusFilter(status)} className={`px-3 py-2 rounded-lg border text-xs font-semibold ${statusFilter===status?'border-accent bg-accent/10 text-accent':'border-subtle bg-surface-raised text-secondary'}`}>{status==='all'?`All (${rows.length})`:`${STATUS_LABEL[status]} (${counts[status]})`}</button>)}</div></div>
        {loading&&!rows.length?<div className="space-y-3">{[0,1,2,3].map(i=><div key={i} className="h-20 rounded-2xl border border-subtle bg-surface-card skeleton-shimmer animate-shimmer"/>)}</div>:<section className="bg-surface-card border border-subtle rounded-2xl overflow-hidden"><div className="hidden md:grid grid-cols-[1.4fr_120px_90px_110px_80px] gap-4 px-5 py-3 border-b border-subtle text-xs text-secondary"><span>Employee</span><span>Score</span><span>Sessions</span><span>Last seen</span><span>Alerts</span></div>{filtered.map(row=>{const score=classifyScore(row.avgScore);const href=employeePath(row.employee.name);return <a key={row.employee.name} href={href} onClick={event=>open(event,row.employee)} className="grid md:grid-cols-[1.4fr_120px_90px_110px_80px] gap-3 md:gap-4 items-center px-5 py-4 border-b border-subtle hover:bg-surface-raised group"><div className="flex items-center gap-3 min-w-0"><span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[row.status]}`}/><div className="min-w-0"><p className="font-semibold truncate group-hover:text-accent">{row.employee.name}</p><p className="text-xs text-secondary truncate mt-0.5">{row.employee.role}{row.employee.client?` · ${row.employee.client}`:''} · <span className={STATUS_CLASS[row.status]}>{STATUS_LABEL[row.status]}</span></p></div></div><span className={`text-sm font-semibold ${score.color}`}>{row.avgScore||'—'}</span><span className="text-sm text-secondary">{row.sessions}</span><span className="text-sm text-secondary">{timeAgo(row.lastSeen)}</span><span>{row.alertCount>0?<span className="inline-flex items-center gap-1 text-xs text-red-400"><AlertTriangle className="w-3.5 h-3.5"/>{row.alertCount}</span>:<span className="text-secondary">—</span>}</span></a>})}{!filtered.length&&<div className="p-10 text-center text-sm text-secondary">No employees match the current URL filters.</div>}</section>}
        {allAlerts.length>0&&<a href="/alerts" onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate('/alerts')}}} className="inline-flex items-center gap-2 text-sm text-red-400 hover:underline"><AlertTriangle className="w-4 h-4"/>{allAlerts.length} active alerts</a>}
      </main>
    </div>
  </div>;
};