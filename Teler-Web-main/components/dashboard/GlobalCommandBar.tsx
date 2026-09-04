import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Command, Users, Bell, LayoutDashboard, Settings, BrainCircuit, BarChart3, X } from 'lucide-react';
import { Employee, Session } from '../../types';
import { NavSection } from './DashboardSidebar';

interface Props {
  sessions: Session[];
  onNavigate: (section: NavSection) => void;
  onEmployee: (employee: Employee) => void;
  onOpenAi: () => void;
}

type Result = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
};

export const GlobalCommandBar: React.FC<Props> = ({ sessions, onNavigate, onEmployee, onOpenAi }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(value => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('teler:open-command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('teler:open-command', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const employees = useMemo(() => {
    const map = new Map<string, Employee>();
    sessions.forEach(session => {
      const name = session.userName || session.role;
      if (name && !map.has(name)) map.set(name, { name, role: session.role ?? '', client: session.client ?? '' });
    });
    return [...map.values()];
  }, [sessions]);

  const results = useMemo<Result[]>(() => {
    const actions: Result[] = [
      { id:'dashboard', label:'Dashboard', description:'Open workforce overview', icon:<LayoutDashboard className="w-4 h-4" />, action:() => onNavigate('dashboard') },
      { id:'employees', label:'Employees', description:'Browse people and performance', icon:<Users className="w-4 h-4" />, action:() => onNavigate('employees') },
      { id:'alerts', label:'Alerts', description:'Open operational alert queue', icon:<Bell className="w-4 h-4" />, action:() => onNavigate('alerts') },
      { id:'workspace', label:'Control Center', description:'Compare, report, export, configure enterprise controls', icon:<BarChart3 className="w-4 h-4" />, action:() => onNavigate('workspace') },
      { id:'ai', label:'Ask TELER AI', description:'Open explainable workforce assistant', icon:<BrainCircuit className="w-4 h-4" />, action:onOpenAi },
      { id:'settings', label:'AI Settings', description:'Configure model and behavior', icon:<Settings className="w-4 h-4" />, action:() => onNavigate('ai-settings') },
    ];
    const employeeResults: Result[] = employees.map(employee => ({ id:`employee-${employee.name}`, label:employee.name, description:[employee.role, employee.client].filter(Boolean).join(' · ') || 'Employee detail', icon:<Users className="w-4 h-4" />, action:() => onEmployee(employee) }));
    const sessionResults: Result[] = sessions.slice(0,30).map(session => ({ id:`session-${session.id}`, label:`${session.userName || session.role || 'Employee'} · ${new Date(session.created_at).toLocaleDateString()}`, description:`Session ${session.id} · ${session.overall_productivity_score}/100 · ${session.total_minutes}m`, icon:<Command className="w-4 h-4" />, action:() => onEmployee({ name:session.userName || session.role || 'Unknown', role:session.role ?? '', client:session.client ?? '' }) }));
    const all = [...actions, ...employeeResults, ...sessionResults];
    const q = query.trim().toLowerCase();
    return q ? all.filter(item => `${item.label} ${item.description}`.toLowerCase().includes(q)).slice(0,12) : all.slice(0,10);
  }, [employees, sessions, query, onNavigate, onEmployee, onOpenAi]);

  const run = (result: Result) => {
    result.action();
    setOpen(false);
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Open command bar" className="fixed top-3 left-[calc(50%+7rem)] -translate-x-1/2 z-30 h-9 px-3.5 rounded-xl border border-subtle bg-surface-raised text-secondary hover:text-primary hidden lg:flex items-center gap-2 shadow-sm transition-colors">
      <span className="text-xs font-medium">Search</span><kbd className="hidden xl:inline text-[10px] border border-subtle rounded px-1.5 py-0.5">⌘K</kbd>
    </button>

    {open && <div className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="TELER command bar" className="w-full max-w-2xl bg-surface-raised border border-subtle rounded-2xl shadow-2xl overflow-hidden" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 border-b border-subtle"><Search className="w-5 h-5 text-secondary shrink-0" /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} aria-label="Search TELER" placeholder="Search employees, sessions, alerts, actions, settings…" className="flex-1 min-w-0 bg-transparent py-4 outline-none text-primary placeholder:text-secondary text-sm" /><button type="button" aria-label="Close command bar" onClick={() => setOpen(false)} className="p-2 text-secondary hover:text-primary"><X className="w-4 h-4" /></button></div>
        <div className="p-2 max-h-[55vh] overflow-y-auto">{results.length ? results.map(result => <button key={result.id} type="button" onClick={() => run(result)} className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-card transition-colors"><span className="w-9 h-9 rounded-lg bg-surface-card border border-subtle flex items-center justify-center text-secondary shrink-0">{result.icon}</span><span className="min-w-0"><span className="block text-sm font-semibold text-primary truncate">{result.label}</span><span className="block text-xs text-secondary truncate mt-0.5">{result.description}</span></span></button>) : <div className="px-4 py-10 text-center text-sm text-secondary">No matching TELER results.</div>}</div>
      </div>
    </div>}
  </>;
};