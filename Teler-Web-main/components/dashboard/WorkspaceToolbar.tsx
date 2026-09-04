import React, { useEffect, useState } from 'react';
import { ChevronDown, Filter, Save, Trash2 } from 'lucide-react';
import { deleteSavedView, getSavedViews, getWorkspaceFilters, saveView, saveWorkspaceFilters, SavedView, WorkspaceFilters } from '../../services/workspaceService';
import { Session } from '../../types';

interface Props { sessions: Session[]; compact?: boolean; }

export const WorkspaceToolbar: React.FC<Props> = ({ sessions, compact = false }) => {
  const [filters, setFilters] = useState<WorkspaceFilters>(() => getWorkspaceFilters());
  const [views, setViews] = useState<SavedView[]>(() => getSavedViews());
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');
  const teams = [...new Set(sessions.map(session => session.client).filter(Boolean) as string[])].sort();
  const roles = [...new Set(sessions.map(session => session.role).filter(Boolean) as string[])].sort();
  const timezones = [...new Set([filters.timezone, 'UTC', 'Asia/Karachi', 'Europe/London', 'America/New_York', 'America/Los_Angeles'])];

  useEffect(() => { saveWorkspaceFilters(filters); }, [filters]);
  useEffect(() => {
    const sync = () => setFilters(getWorkspaceFilters());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const update = <K extends keyof WorkspaceFilters>(key: K, value: WorkspaceFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const selectClass = 'bg-surface-page border border-subtle text-primary text-xs rounded-lg px-3 py-2 pr-8 outline-none hover:border-strong focus:border-accent appearance-none transition-colors';
  const saveCurrent = () => { saveView(viewName, filters); setViewName(''); setSaving(false); setViews(getSavedViews()); };

  return <div className={`bg-surface-card border border-strong rounded-2xl ${compact ? 'p-3' : 'p-4'} shadow-card`}>
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex items-center gap-2 text-primary mr-1"><Filter className="w-4 h-4 text-accent" /><span className="text-xs font-semibold">Filters</span></div>
      <label className="relative"><span className="sr-only">Date range</span><select className={selectClass} value={filters.days} onChange={event => update('days',Number(event.target.value))}><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={9999}>All time</option></select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" /></label>
      <label className="relative"><span className="sr-only">Team</span><select className={selectClass} value={filters.team} onChange={event => update('team',event.target.value)}><option value="all">All teams</option>{teams.map(value=><option key={value}>{value}</option>)}</select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" /></label>
      <label className="relative"><span className="sr-only">Role</span><select className={selectClass} value={filters.role} onChange={event => update('role',event.target.value)}><option value="all">All roles</option>{roles.map(value=><option key={value}>{value}</option>)}</select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" /></label>
      <label className="relative"><span className="sr-only">Risk level</span><select className={selectClass} value={filters.risk} onChange={event => update('risk',event.target.value as WorkspaceFilters['risk'])}><option value="all">All risk</option><option value="healthy">Healthy</option><option value="attention">Needs attention</option><option value="high">High risk</option></select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" /></label>
      <label className="relative"><span className="sr-only">Timezone</span><select className={selectClass} value={filters.timezone} onChange={event => update('timezone',event.target.value)}>{timezones.map(value=><option key={value}>{value}</option>)}</select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" /></label>
      <label className="relative"><span className="sr-only">Comparison period</span><select className={selectClass} value={filters.compare} onChange={event => update('compare',event.target.value as WorkspaceFilters['compare'])}><option value="previous_period">Previous period</option><option value="previous_week">Previous week</option><option value="previous_month">Previous month</option></select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" /></label>
      <button type="button" onClick={() => setSaving(value=>!value)} className="h-9 px-3 rounded-lg border border-accent bg-accent-soft text-primary hover:bg-surface-hover text-xs font-medium flex items-center gap-1.5 transition-colors"><Save className="w-3.5 h-3.5 text-accent" />Save view</button>
    </div>
    <p className="text-[11px] text-muted mt-2.5">These filters are reflected in the URL, so the current analysis can be bookmarked or shared.</p>
    {saving && <div className="flex gap-2 mt-3 max-w-md"><input aria-label="Saved view name" value={viewName} onChange={event=>setViewName(event.target.value)} placeholder="e.g. Weekly engineering risk" className="flex-1 min-w-0 bg-surface-page border border-subtle rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent" /><button type="button" onClick={saveCurrent} className="px-3 rounded-lg bg-accent text-white text-xs font-semibold">Save</button></div>}
    {views.length>0 && <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-subtle"><span className="text-xs text-muted py-1">Saved views</span>{views.slice(0,6).map(view=><div key={view.id} className="flex items-center rounded-lg bg-surface-page border border-subtle overflow-hidden"><button type="button" onClick={()=>setFilters(view.filters)} className="px-2.5 py-1.5 text-xs text-primary hover:bg-surface-hover">{view.name}</button><button type="button" aria-label={`Delete ${view.name}`} onClick={()=>{deleteSavedView(view.id);setViews(getSavedViews())}} className="px-2 py-1.5 text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button></div>)}</div>}
  </div>;
};