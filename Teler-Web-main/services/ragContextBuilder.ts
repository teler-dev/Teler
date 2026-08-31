import { Session } from '../types';

interface SessionSummary {
  id: string;
  date: string;
  duration_min: number;
  score: number;
  risk: 'healthy' | 'warning' | 'high_risk';
  task: string;
  role: string;
  client: string;
  model_used: string;
  red_flags: string[];
  context_switches: number;
  idle_pct: number;
  dominant_app: string | null;
}

interface EmployeeContext {
  name: string;
  session_count: number;
  avg_score: number;
  total_tracked_min: number;
  idle_min: number;
  context_switches: number;
  dominant_app: string | null;
  alerts: string[];
  sessions: SessionSummary[];
}

export interface RagContext {
  query_date: string;
  total_sessions: number;
  employees: EmployeeContext[];
}

function riskLevel(score: number): SessionSummary['risk'] {
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'warning';
  return 'high_risk';
}

function dominantApp(session: Session): string | null {
  const segs = session.timeline_segments ?? [];
  if (segs.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const seg of segs) {
    const app = (seg as any).resolvedApp ?? (seg as any).app ?? '';
    if (app) counts[app] = (counts[app] ?? 0) + ((seg as any).endMin - (seg as any).startMin);
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function contextSwitches(session: Session): number {
  return (session.app_switches ?? []).length;
}

function idlePct(session: Session): number {
  if (!session.total_minutes || session.total_minutes === 0) return 0;
  const idleMin = (session.timeline_segments ?? [])
    .filter((s: any) => s.type === 'idle')
    .reduce((sum: number, s: any) => sum + ((s.endMin ?? 0) - (s.startMin ?? 0)), 0);
  return Math.round((idleMin / session.total_minutes) * 100);
}

export function buildRagContext(sessions: Session[]): RagContext {
  // Group by employee
  const byEmployee: Record<string, Session[]> = {};
  for (const s of sessions) {
    const name = s.userName ?? 'Unknown';
    if (!byEmployee[name]) byEmployee[name] = [];
    byEmployee[name].push(s);
  }

  const employees: EmployeeContext[] = Object.entries(byEmployee).map(([name, empSessions]) => {
    const totalTracked = empSessions.reduce((sum, s) => sum + (s.total_minutes ?? 0), 0);
    const avgScore = empSessions.length
      ? Math.round(empSessions.reduce((sum, s) => sum + (s.overall_productivity_score ?? 0), 0) / empSessions.length)
      : 0;
    const totalSwitches = empSessions.reduce((sum, s) => sum + contextSwitches(s), 0);
    const totalIdleMin = empSessions.reduce((sum, s) => {
      const ip = idlePct(s);
      return sum + Math.round((ip / 100) * (s.total_minutes ?? 0));
    }, 0);

    // Dominant app across all sessions
    const appCounts: Record<string, number> = {};
    for (const s of empSessions) {
      const app = dominantApp(s);
      if (app) appCounts[app] = (appCounts[app] ?? 0) + 1;
    }
    const domApp = Object.entries(appCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Alerts
    const alerts: string[] = [];
    const idlePctTotal = totalTracked > 0 ? Math.round((totalIdleMin / totalTracked) * 100) : 0;
    const switchRate = totalTracked > 0 ? Math.round((totalSwitches / totalTracked) * 60) : 0;
    if (idlePctTotal > 35) alerts.push(`High idle time: ${idlePctTotal}% of tracked time`);
    if (switchRate > 40) alerts.push(`Excessive context switching: ${switchRate}/hr average`);
    if (avgScore < 41) alerts.push(`Low average productivity score: ${avgScore}/100`);
    if (empSessions.some(s => (s.red_flags?.length ?? 0) > 0))
      alerts.push('Red flags detected in one or more sessions');

    const sessionSummaries: SessionSummary[] = empSessions.map(s => ({
      id: s.id,
      date: s.created_at,
      duration_min: s.total_minutes ?? 0,
      score: s.overall_productivity_score ?? 0,
      risk: riskLevel(s.overall_productivity_score ?? 0),
      task: s.task && s.task !== 'N/A' ? s.task : (s.main_tasks?.[0] ?? ''),
      role: s.role ?? '',
      client: s.client ?? '',
      model_used: s.model_used ?? '',
      red_flags: s.red_flags ?? [],
      context_switches: contextSwitches(s),
      idle_pct: idlePct(s),
      dominant_app: dominantApp(s),
    }));

    return {
      name,
      session_count: empSessions.length,
      avg_score: avgScore,
      total_tracked_min: totalTracked,
      idle_min: totalIdleMin,
      context_switches: totalSwitches,
      dominant_app: domApp,
      alerts,
      sessions: sessionSummaries,
    };
  });

  return {
    query_date: new Date().toISOString(),
    total_sessions: sessions.length,
    employees,
  };
}
