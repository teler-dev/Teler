import { Session } from '../types';
import { buildRagContext, RagContext } from './ragContextBuilder';
import { askAiAgent, AiSettings } from './aiAgentService';

export interface AiAgentRequest {
  question: string;
  sessions: Session[];
  employeeFilter?: string;
  settings?: AiSettings;
}

export interface AiSource {
  id: string;
  employee: string;
  sessionId: string;
  timeRange: string;
  metrics: string[];
  confidence: number;
}

export interface AiAgentResponse {
  answer: string;
  context: RagContext;
  sources: AiSource[];
  confidence: number;
}

function sourceConfidence(session: Session): number {
  const values = [
    ...(session.detected_tasks?.map(task => task.confidence) ?? []),
    ...(session.micro_windows?.map(window => window.confidence) ?? []),
  ].filter(value => Number.isFinite(value));
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 100;
}

function relevanceScore(session: Session, question: string): number {
  const q = question.toLowerCase();
  const searchable = [
    session.userName,
    session.role,
    session.client,
    session.claimed_task,
    ...(session.main_tasks ?? []),
    ...(session.red_flags ?? []),
    ...(session.top_apps ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
  const terms = q.split(/\W+/).filter(term => term.length > 2);
  return terms.reduce((score, term) => score + (searchable.includes(term) ? 2 : 0), 0)
    + (session.red_flags?.length ?? 0)
    + Math.max(0, 100 - session.overall_productivity_score) / 50;
}

function buildSources(sessions: Session[], question: string): AiSource[] {
  return [...sessions]
    .sort((a, b) => relevanceScore(b, question) - relevanceScore(a, question))
    .slice(0, 5)
    .map(session => {
      const idlePct = session.total_minutes > 0
        ? Math.round(session.idle_minutes_estimate / session.total_minutes * 100)
        : 0;
      return {
        id: `${session.id}-${session.created_at}`,
        employee: session.userName || session.role || 'Unknown employee',
        sessionId: session.id,
        timeRange: `${new Date(session.session_start).toLocaleString()} – ${new Date(session.session_end).toLocaleTimeString()}`,
        metrics: [
          `Productivity ${session.overall_productivity_score}/100`,
          `Focus ${session.focus_score}/100`,
          `Idle ${idlePct}%`,
          `${session.app_switches?.length ?? 0} context switches`,
        ],
        confidence: sourceConfidence(session),
      };
    });
}

export async function aiAgentHandler(req: AiAgentRequest): Promise<AiAgentResponse> {
  const { question, sessions, employeeFilter, settings } = req;
  const filtered = employeeFilter
    ? sessions.filter(session => session.userName === employeeFilter || session.role === employeeFilter)
    : sessions;
  const context = buildRagContext(filtered);
  const answer = await askAiAgent(question, context, settings);
  const sources = buildSources(filtered, question);
  const confidence = sources.length
    ? Math.round(sources.reduce((sum, source) => sum + source.confidence, 0) / sources.length)
    : 0;
  return { answer, context, sources, confidence };
}