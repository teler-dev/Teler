import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, BrainCircuit, Clock, GitBranch, RefreshCw, Zap } from 'lucide-react';
import { Employee, Session, classifyScore } from '../../types';
import { useSessions } from './useSessions';
import { DashboardSidebar, NavSection } from './DashboardSidebar';
import { generateAlerts } from './alertUtils';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { navigate, sessionPath } from '../../services/routerService';
import { screenshotUrl } from '../../services/apiConfig';
import { PageHeader } from '../ui/PageHeader';
import { IconButton } from '../ui/IconButton';
import { InlineAlert } from '../ui/InlineAlert';
import { Card } from '../ui/Card';
import { MetricValue } from '../ui/MetricValue';
import { KpiGrid, MetricCard, PageContainer } from '../ui/AnalyticsLayout';
import { LoadingState } from '../ui/LoadingState';
import { DataList, DataListLink } from '../ui/DataList';
import { EvidenceGallery } from '../ui/EvidenceGallery';

interface Props { onLogout:()=>void; userName?:string; initialEmployee?:Employee; onBack?:()=>void; }
function fmtDuration(minutes:number){const hours=Math.floor(minutes/60),rest=Math.round(minutes%60);return hours?`${hours}h ${rest}m`:`${rest}m`}
function fmtDate(value:string){return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function sessionConfidence(session:Session){const values=[...(session.detected_tasks?.map(item=>item.confidence)??[]),...(session.micro_windows?.map(item=>item.confidence)??[])].filter(Number.isFinite);return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):100}
function sessionIdFromPath(){const match=window.location.pathname.match(/\/sessions\/([^/]+)$/);return match?decodeURIComponent(match[1]):null}

export const Dashboard:React.FC<Props>=({onLogout,userName='User',initialEmployee,onBack})=>{
  const {sessions,loading,error,refetch}=useSessions(initialEmployee?.name);
  const [selectedId,setSelectedId]=useState<string|null>(()=>sessionIdFromPath());
  const alerts=useMemo(()=>generateAlerts(sessions),[sessions]);
  const selected=useMemo(()=>sessions.find(session=>session.id===selectedId)??sessions[0]??null,[sessions,selectedId]);
  const employee:Employee=initialEmployee??{name:selected?.userName||selected?.role||'Employee',role:selected?.role??'',client:selected?.client??''};
  useEffect(()=>{const onPop=()=>setSelectedId(sessionIdFromPath());window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[]);

  const navigateSection=(section:NavSection)=>{if(section==='dashboard'){navigate('/dashboard');return}if(section==='employees'){navigate('/employees');return}if(section==='alerts'){navigate('/alerts');return}if(section==='workspace'){navigate('/analytics');return}if(section==='ai-settings'){navigate('/settings/ai');return}onBack?.()};
  const idlePct=selected&&selected.total_minutes>0?Math.round(selected.idle_minutes_estimate/selected.total_minutes*100):0;
  const scoreClass=classifyScore(selected?.overall_productivity_score??0),switches=selected?.app_switches?.length??0;
  const hasScore=(selected?.overall_productivity_score??0)>0;
  const deepWork=selected?.analytics?.deep_work_minutes??selected?.hour_blocks?.reduce((sum,hour)=>sum+(hour.deep_work_minutes??0),0)??0;
  const evidenceApps=selected?.evidence?.top_apps_minutes??[],confidence=selected?sessionConfidence(selected):0;
  const screenshots=selected?.evidence?.screenshot_urls??[];
  const deterministicSummary=selected?`${hasScore?`Productivity ${selected.overall_productivity_score}/100`:'Productivity not scored'}, ${selected.focus_score>0?`focus ${selected.focus_score}/100`:'focus not scored'}, ${idlePct}% idle time and ${switches} context switch${switches===1?'':'es'} across ${fmtDuration(selected.total_minutes)}.`:'';

  return <div className="min-h-screen bg-surface-page text-primary flex">
    <DashboardSidebar activeSection="employees" onNavigate={navigateSection} alertCount={alerts.length} onLogout={onLogout} clientName={userName}/>
    <div className="flex-1 ml-56 min-w-0 flex flex-col min-h-screen relative z-10">
      <PageHeader
        eyebrow="Employee Intelligence"
        title={employee.name}
        meta={<span>{employee.role||'Role not provided'}{employee.client?` · ${employee.client}`:''} · {loading && !sessions.length ? 'loading sessions…' : `${sessions.length} supporting session${sessions.length===1?'':'s'}`}</span>}
        leading={<IconButton label="Back to employees" onClick={() => navigate('/employees')}><ArrowLeft className="w-4 h-4"/></IconButton>}
        actions={<>{selected&&<MetricValue value={selected.overall_productivity_score} state={hasScore?'value':'unscored'} suffix="/100" showClassification />}<IconButton label="Refresh employee telemetry" onClick={()=>refetch(true)} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></IconButton></>}
        compact
      />
      <PageContainer>
        <details className="bg-surface-card border border-subtle rounded-2xl shadow-card"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-primary">Employee filters</summary><div className="px-3 pb-3"><WorkspaceToolbar sessions={sessions} compact/></div></details>

        {error&&<InlineAlert tone="danger" title="Live employee data unavailable">{error}</InlineAlert>}
        {loading&&!selected?<LoadingState variant="detail" label="Loading employee telemetry" />:selected?<>
          <KpiGrid>
            <MetricCard label="Productivity" icon={<Zap className="w-4 h-4"/>} value={<MetricValue value={selected.overall_productivity_score} state={hasScore?'value':'unscored'} suffix="/100" />} helper={hasScore?scoreClass.label:'Not scored'} />
            <MetricCard label="Deep work" icon={<BrainCircuit className="w-4 h-4"/>} value={<span className="text-2xl md:text-3xl font-bold">{fmtDuration(deepWork)}</span>} helper={`of ${fmtDuration(selected.total_minutes)}`} />
            <MetricCard label="Idle time" icon={<Clock className="w-4 h-4"/>} value={<span className="text-2xl md:text-3xl font-bold">{idlePct}%</span>} helper={fmtDuration(selected.idle_minutes_estimate)} />
            <MetricCard label="Context switches" icon={<GitBranch className="w-4 h-4"/>} value={<span className="text-2xl md:text-3xl font-bold">{switches}</span>} helper={selected.total_minutes?`${Math.round(switches/(selected.total_minutes/60||1))}/hr`:'this session'} />
          </KpiGrid>
          <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><div className="teler-ai-narrative bg-surface-card border border-subtle rounded-2xl p-5 md:p-6"><div className="flex items-center gap-2"><BrainCircuit className="w-4 h-4 text-accent"/><h3 className="font-semibold">AI session interpretation</h3><span className="ml-auto text-xs text-secondary">Confidence {confidence}%</span></div><p className="text-sm text-secondary leading-6 mt-4">{deterministicSummary}</p><div className="mt-5 pt-4 border-t border-subtle"><p className="text-sm font-semibold">Why this conclusion?</p><ul className="mt-2 space-y-2 text-sm text-secondary"><li>Supporting session · {fmtDate(selected.created_at)}</li><li>Focus {selected.focus_score>0?`${selected.focus_score}/100`:'not scored'} · idle {idlePct}% · {switches} context switches</li>{selected.main_tasks?.slice(0,2).map(task=><li key={task}>Observed task: {task}</li>)}</ul></div></div>{screenshots.length?<EvidenceGallery imageUrls={screenshots.map(screenshotUrl)} />:<div className="bg-surface-card border border-subtle rounded-2xl p-5 md:p-6"><div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-accent"/><h3 className="font-semibold">Evidence</h3></div>{evidenceApps.length?<div className="space-y-3 mt-4">{evidenceApps.slice(0,6).map(app=><div key={`${app.app}-${app.minutes}`}><div className="flex justify-between gap-3 text-sm"><span className="truncate">{app.app}</span><span className="text-secondary shrink-0">{fmtDuration(app.minutes)}</span></div><div className="h-1.5 bg-surface-raised rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-accent rounded-full" style={{width:`${Math.min(100,app.minutes/Math.max(...evidenceApps.map(item=>item.minutes),1)*100)}%`}}/></div></div>)}</div>:<p className="text-sm text-secondary mt-4">No evidence was recorded for this session.</p>}</div>}</section>
          <DataList><div className="p-4 md:p-5 border-b border-subtle"><h3 className="font-semibold">Supporting sessions</h3><p className="text-sm text-secondary mt-1">Each session has its own shareable URL.</p></div>{sessions.map(session=>{const href=sessionPath(employee.name,session.id);return <DataListLink key={session.id} href={href} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();setSelectedId(session.id);navigate(href)}}} className={`grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto] gap-3 items-center ${selected.id===session.id?'bg-accent/10':''}`}><span><span className="block text-sm font-semibold">{fmtDate(session.created_at)}</span><span className="block text-xs text-secondary mt-0.5 truncate">{session.main_tasks?.[0]||session.claimed_task||'Tracked TELER session'}</span></span><MetricValue value={session.overall_productivity_score} state={session.overall_productivity_score>0?'value':'unscored'} compact /><span className="hidden md:block text-sm text-secondary">{fmtDuration(session.total_minutes)}</span><span className="hidden md:block text-sm text-secondary">{session.app_switches?.length??0} switches</span></DataListLink>})}</DataList>
        </>:<section className="bg-surface-card border border-subtle rounded-2xl p-10 text-center"><h2 className="font-semibold">No sessions in the selected view</h2><p className="text-sm text-secondary mt-2">Adjust the URL filters or refresh telemetry.</p></section>}
      </PageContainer>
    </div>
  </div>;
};