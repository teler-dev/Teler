/**
 * Client-side AI agent module.
 * Wraps ragContextBuilder + aiAgentService for use in React components.
 */
import { Session } from '../types';
import { buildRagContext, RagContext } from './ragContextBuilder';
import { askAiAgent, AiSettings } from './aiAgentService';

export interface AiAgentRequest {
  question: string;
  sessions: Session[];
  /** Optionally scope context to a single employee. */
  employeeFilter?: string;
  settings?: AiSettings;
}

export interface AiAgentResponse {
  answer: string;
  context: RagContext;
}

export async function aiAgentHandler(req: AiAgentRequest): Promise<AiAgentResponse> {
  const { question, sessions, employeeFilter, settings } = req;
  const filtered = employeeFilter
    ? sessions.filter((session) => session.userName === employeeFilter)
    : sessions;
  const context = buildRagContext(filtered);
  const answer = await askAiAgent(question, context, settings);
  return { answer, context };
}
