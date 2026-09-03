import { AlertSeverity } from '../components/dashboard/alertUtils';

export type ComparisonPeriod = 'previous_period' | 'previous_week' | 'previous_month';
export type RiskFilter = 'all' | 'healthy' | 'attention' | 'high';
export interface WorkspaceFilters { days:number; team:string; role:string; office:string; risk:RiskFilter; schedule:string; timezone:string; compare:ComparisonPeriod; }
export interface SavedView { id:string; name:string; filters:WorkspaceFilters; createdAt:string; }
export type AlertWorkflowStatus = 'open'|'acknowledged'|'snoozed'|'resolved';
export interface AlertWorkflowState { status:AlertWorkflowStatus; owner:string; note:string; snoozedUntil:string|null; updatedAt:string; history:Array<{at:string;action:string;actor:string}>; }
export interface EnterprisePreferences { ssoRequired:boolean; mfaRequired:boolean; rawRetentionDays:number; screenshotRetentionDays:number; employeeConsentRequired:boolean; redactSensitiveData:boolean; auditLogging:boolean; }
export interface NotificationRoute { id:string; channel:'email'|'slack'|'teams'|'webhook'; destination:string; minimumSeverity:AlertSeverity; enabled:boolean; }

const FILTER_KEY='teler_workspace_filters', VIEW_KEY='teler_saved_views', ALERT_KEY='teler_alert_workflow', ENTERPRISE_KEY='teler_enterprise_preferences', NOTIFICATION_KEY='teler_notification_routes', EVENT='teler:workspace-change';
export const DEFAULT_FILTERS:WorkspaceFilters={days:30,team:'all',role:'all',office:'all',risk:'all',schedule:'all',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',compare:'previous_period'};
export const DEFAULT_ENTERPRISE:EnterprisePreferences={ssoRequired:false,mfaRequired:true,rawRetentionDays:90,screenshotRetentionDays:30,employeeConsentRequired:true,redactSensitiveData:true,auditLogging:true};

function readObject<T extends object>(key:string,fallback:T):T{try{const raw=localStorage.getItem(key);return raw?{...fallback,...JSON.parse(raw)}:fallback}catch{return fallback}}
function emit(){window.dispatchEvent(new Event(EVENT))}

function queryFilters(base:WorkspaceFilters):WorkspaceFilters{
  const params=new URLSearchParams(window.location.search);
  const days=Number(params.get('days'));
  const risk=params.get('risk');
  const compare=params.get('compare');
  return {
    ...base,
    days:Number.isFinite(days)&&days>0?days:base.days,
    team:params.get('team')||base.team,
    role:params.get('role')||base.role,
    risk:risk==='healthy'||risk==='attention'||risk==='high'?risk:base.risk,
    timezone:params.get('timezone')||base.timezone,
    compare:compare==='previous_week'||compare==='previous_month'?compare:base.compare,
    office:'all', schedule:'all',
  };
}
function syncQuery(filters:WorkspaceFilters){
  const url=new URL(window.location.href);
  const values:Record<string,string|number>={days:filters.days,team:filters.team,role:filters.role,risk:filters.risk,timezone:filters.timezone,compare:filters.compare};
  Object.entries(values).forEach(([key,value])=>{if(value===''||value==='all'||(key==='days'&&value===30)|| (key==='compare'&&value==='previous_period')) url.searchParams.delete(key); else url.searchParams.set(key,String(value));});
  window.history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`);
}

export function getWorkspaceFilters():WorkspaceFilters{return queryFilters(readObject(FILTER_KEY,{...DEFAULT_FILTERS}))}
export function saveWorkspaceFilters(filters:WorkspaceFilters){const safe={...filters,office:'all',schedule:'all'};localStorage.setItem(FILTER_KEY,JSON.stringify(safe));syncQuery(safe);emit()}
export function getSavedViews():SavedView[]{try{return JSON.parse(localStorage.getItem(VIEW_KEY)??'[]')}catch{return[]}}
export function saveView(name:string,filters:WorkspaceFilters):SavedView{const view={id:crypto.randomUUID(),name:name.trim()||'Saved view',filters:{...filters,office:'all',schedule:'all'},createdAt:new Date().toISOString()};localStorage.setItem(VIEW_KEY,JSON.stringify([view,...getSavedViews()].slice(0,20)));emit();return view}
export function deleteSavedView(id:string){localStorage.setItem(VIEW_KEY,JSON.stringify(getSavedViews().filter(view=>view.id!==id)));emit()}
export function getAlertWorkflows():Record<string,AlertWorkflowState>{try{return JSON.parse(localStorage.getItem(ALERT_KEY)??'{}')}catch{return{}}}
export function getAlertWorkflow(alertId:string):AlertWorkflowState{return getAlertWorkflows()[alertId]??{status:'open',owner:'',note:'',snoozedUntil:null,updatedAt:new Date().toISOString(),history:[]}}
export function updateAlertWorkflow(alertId:string,patch:Partial<AlertWorkflowState>,actor='Manager'):AlertWorkflowState{const all=getAlertWorkflows(),current=getAlertWorkflow(alertId),status=patch.status??current.status,action=status!==current.status?`Status changed to ${status}`:'Alert workflow updated',next={...current,...patch,updatedAt:new Date().toISOString(),history:[{at:new Date().toISOString(),action,actor},...current.history].slice(0,30)};all[alertId]=next;localStorage.setItem(ALERT_KEY,JSON.stringify(all));emit();return next}
export function getEnterprisePreferences():EnterprisePreferences{return readObject(ENTERPRISE_KEY,{...DEFAULT_ENTERPRISE})}
export function saveEnterprisePreferences(prefs:EnterprisePreferences){localStorage.setItem(ENTERPRISE_KEY,JSON.stringify(prefs));emit()}
export function getNotificationRoutes():NotificationRoute[]{try{return JSON.parse(localStorage.getItem(NOTIFICATION_KEY)??'[]')}catch{return[]}}
export function saveNotificationRoutes(routes:NotificationRoute[]){localStorage.setItem(NOTIFICATION_KEY,JSON.stringify(routes));emit()}
export function subscribeWorkspace(listener:()=>void):()=>void{window.addEventListener(EVENT,listener);const query=()=>listener();window.addEventListener('popstate',query);return()=>{window.removeEventListener(EVENT,listener);window.removeEventListener('popstate',query)}}

export function filterSessionsByWorkspace<T extends {created_at:string;client?:string;role?:string;overall_productivity_score:number;idle_minutes_estimate:number;total_minutes:number}>(sessions:T[],filters=getWorkspaceFilters()):T[]{
  const cutoff=filters.days===9999?null:(()=>{const date=new Date();date.setDate(date.getDate()-filters.days);date.setHours(0,0,0,0);return date})();
  return sessions.filter(session=>{if(cutoff&&new Date(session.created_at)<cutoff)return false;if(filters.team!=='all'&&(session.client??'')!==filters.team)return false;if(filters.role!=='all'&&(session.role??'')!==filters.role)return false;if(filters.risk!=='all'){const idlePct=session.total_minutes>0?session.idle_minutes_estimate/session.total_minutes:0,high=session.overall_productivity_score<41||idlePct>.4,attention=high||session.overall_productivity_score<71||idlePct>.25;if(filters.risk==='high'&&!high)return false;if(filters.risk==='attention'&&!attention)return false;if(filters.risk==='healthy'&&attention)return false}return true});
}