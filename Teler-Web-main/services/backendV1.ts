import { Session } from '../types';
import { apiFetch } from './apiConfig';

const DEFAULT_ORGANIZATION_KEY = 'COMP_DEV_001';

interface ApiEnvelope<T> { data: T; pagination?: { limit:number; offset:number; total:number } }
interface V1Company { id:string; external_key?:string|null; slug:string; name:string; status:string }
interface V1Employee { id:string; external_key:string; display_name:string; job_role:string; status:string }
interface V1SessionRow {
  id:string;
  external_session_id:string;
  employee_id:string;
  employee_name:string;
  started_at:string;
  ended_at?:string|null;
  total_minutes?:number|string|null;
  status:string;
  productivity_score?:number|string|null;
  active_minutes?:number|string|null;
  idle_minutes?:number|string|null;
  deep_work_minutes?:number|string|null;
  app_switch_count?:number|string|null;
  key_count?:number|string|null;
  mouse_clicks?:number|string|null;
}
export interface V1PersistedAlert {
  id:string;
  employee_id:string;
  employee_name:string;
  session_id?:string|null;
  alert_type:string;
  severity:string;
  metric?:string|null;
  threshold?:number|string|null;
  actual_value?:number|string|null;
  description:string;
  status:string;
  created_at:string;
}
export type SessionWithPersistedAlerts = Session & { persisted_alerts?: V1PersistedAlert[] };

let organizationPromise:Promise<V1Company|null>|null=null;

async function jsonOrThrow<T>(response:Response):Promise<T>{
  if(!response.ok){
    const payload=await response.json().catch(()=>null) as {error?:unknown}|null;
    throw new Error(typeof payload?.error==='string'?payload.error:`TELER v1 HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

const numberOr=(value:unknown,fallback=0):number=>{
  const parsed=typeof value==='number'?value:Number(value);
  return Number.isFinite(parsed)?parsed:fallback;
};

export async function resolveOrganization(force=false):Promise<V1Company|null>{
  if(force)organizationPromise=null;
  if(!organizationPromise){
    organizationPromise=(async()=>{
      const response=await apiFetch(`/api/v1/companies?key=${encodeURIComponent(DEFAULT_ORGANIZATION_KEY)}`);
      if(response.status===503)return null;
      const payload=await jsonOrThrow<ApiEnvelope<V1Company[]>>(response);
      return payload.data?.[0]??null;
    })().catch(()=>null);
  }
  return organizationPromise;
}

export async function fetchV1Employees():Promise<V1Employee[]>{
  const org=await resolveOrganization();
  if(!org)return [];
  const response=await apiFetch(`/api/v1/companies/${encodeURIComponent(org.id)}/employees?status=active`);
  if(response.status===503)return [];
  return (await jsonOrThrow<ApiEnvelope<V1Employee[]>>(response)).data??[];
}

function minimalSession(row:V1SessionRow,employee?:V1Employee):SessionWithPersistedAlerts{
  const total=numberOr(row.total_minutes);
  const active=numberOr(row.active_minutes,total);
  const idle=numberOr(row.idle_minutes,Math.max(0,total-active));
  const productivity=numberOr(row.productivity_score);
  const switches=Math.max(0,Math.round(numberOr(row.app_switch_count)));
  const role=employee?.job_role||'';
  return {
    id:row.external_session_id||row.id,
    session_start:row.started_at,
    session_end:row.ended_at||row.started_at,
    total_minutes:total,
    focus_score:productivity,
    workflow_structure_score:productivity,
    tool_usage_score:productivity,
    context_switching_score:Math.max(0,100-Math.min(100,switches*2)),
    overall_productivity_score:productivity,
    active_minutes_estimate:active,
    idle_minutes_estimate:idle,
    main_tasks:[],main_distractions:[],top_apps:[],red_flags:[],recommendations:[],
    report_type:'OCR',model_used:'normalized-v1',created_at:row.ended_at||row.started_at,
    userName:row.employee_name||employee?.display_name,
    role,
    key_count:numberOr(row.key_count),mouse_clicks:numberOr(row.mouse_clicks),
    app_switches:Array.from({length:switches},(_,index)=>({atMin:index,from:'',to:''})),
    claimed_task:'Tracked via TELER',
    evidence:{screenshot_count:0,screenshot_urls:[],ocr_sample:'',keystroke_per_minute:[],peak_wpm:0,top_apps_minutes:[]},
  };
}

function mergeAuthoritative(legacy:Session,row:V1SessionRow,employee?:V1Employee):SessionWithPersistedAlerts{
  const total=numberOr(row.total_minutes,legacy.total_minutes);
  const active=numberOr(row.active_minutes,legacy.active_minutes_estimate);
  const idle=numberOr(row.idle_minutes,legacy.idle_minutes_estimate);
  const score=numberOr(row.productivity_score,legacy.overall_productivity_score);
  const switchCount=Math.max(0,Math.round(numberOr(row.app_switch_count,legacy.app_switches?.length??0)));
  const existingSwitches=legacy.app_switches??[];
  const switches=existingSwitches.length===switchCount
    ? existingSwitches
    : existingSwitches.length>switchCount
      ? existingSwitches.slice(0,switchCount)
      : [...existingSwitches,...Array.from({length:Math.max(0,switchCount-existingSwitches.length)},(_,index)=>({atMin:legacy.total_minutes?((index+1)*legacy.total_minutes/(switchCount+1)):index,from:'',to:''}))];
  return {
    ...legacy,
    id:row.external_session_id||legacy.id,
    session_start:row.started_at||legacy.session_start,
    session_end:row.ended_at||legacy.session_end,
    created_at:row.ended_at||legacy.created_at,
    total_minutes:total,
    active_minutes_estimate:active,
    idle_minutes_estimate:idle,
    overall_productivity_score:score,
    key_count:numberOr(row.key_count,legacy.key_count??0),
    mouse_clicks:numberOr(row.mouse_clicks,legacy.mouse_clicks??0),
    app_switches:switches,
    userName:row.employee_name||legacy.userName||employee?.display_name,
    role:legacy.role||employee?.job_role,
    analytics:legacy.analytics?{...legacy.analytics,deep_work_minutes:numberOr(row.deep_work_minutes,legacy.analytics.deep_work_minutes)}:legacy.analytics,
  };
}

export async function fetchPersistedAlerts():Promise<V1PersistedAlert[]>{
  const org=await resolveOrganization();
  if(!org)return [];
  const response=await apiFetch(`/api/v1/alerts?organization_id=${encodeURIComponent(org.id)}&status=open&limit=200`);
  if(response.status===503)return [];
  return (await jsonOrThrow<ApiEnvelope<V1PersistedAlert[]>>(response)).data??[];
}

export async function fetchAndMergeV1Sessions(legacy:Session[],employeeName?:string):Promise<SessionWithPersistedAlerts[]>{
  const org=await resolveOrganization();
  if(!org)return legacy;
  const employees=await fetchV1Employees().catch(()=>[]);
  const employee=employeeName?employees.find(item=>item.display_name===employeeName||item.external_key===employeeName):undefined;
  if(employeeName&&!employee)return legacy;

  const query=new URLSearchParams({organization_id:org.id,limit:'200'});
  if(employee)query.set('employee_id',employee.id);
  const response=await apiFetch(`/api/v1/sessions?${query.toString()}`);
  if(response.status===503)return legacy;
  const payload=await jsonOrThrow<ApiEnvelope<V1SessionRow[]>>(response);
  const rows=payload.data??[];
  if(!rows.length)return legacy;

  const alerts=await fetchPersistedAlerts().catch(()=>[]);
  const alertsBySessionId=new Map<string,V1PersistedAlert[]>();
  for(const alert of alerts){
    if(!alert.session_id)continue;
    alertsBySessionId.set(alert.session_id,[...(alertsBySessionId.get(alert.session_id)??[]),alert]);
  }

  const legacyById=new Map(legacy.map(session=>[session.id,session]));
  return rows.map(row=>{
    const base=legacyById.get(row.external_session_id)||legacyById.get(row.id);
    const owner=employees.find(item=>item.id===row.employee_id);
    const merged=base?mergeAuthoritative(base,row,owner):minimalSession(row,owner);
    merged.persisted_alerts=alertsBySessionId.get(row.id)??[];
    return merged;
  });
}