export interface AiSettings {
  provider: 'openrouter' | 'openai' | 'local';
  model: string;
  customModel: string;
  useReranking: boolean;
  rerankModel: string;
  customRerankModel: string;
  openRouterApiKey: string;
  openAiApiKey: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export const STORAGE_KEY = 'teler_ai_settings';
export const CUSTOM_MODEL_VALUE = '__custom__';

export const DEFAULT_OPENROUTER_MODEL = 'google/gemma-4-26b-a4b-it:free';
export const DEFAULT_RERANK_MODEL = 'nvidia/llama-nemotron-rerank-vl-1b-v2:free';

export const DEFAULT_SYSTEM_PROMPT =
  'You are TELER AI, a workforce intelligence assistant.\n\n' +
  'Answer questions about employee sessions, productivity, alerts, and activities using the provided telemetry data.\n\n' +
  'Never hallucinate data. If records are missing respond with "No records found".';

export const DEFAULT_SETTINGS: AiSettings = {
  provider: 'openrouter',
  model: DEFAULT_OPENROUTER_MODEL,
  customModel: '',
  useReranking: true,
  rerankModel: DEFAULT_RERANK_MODEL,
  customRerankModel: '',
  openRouterApiKey: '',
  openAiApiKey: '',
  temperature: 0.2,
  maxTokens: 2000,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

export const OPENROUTER_MODELS = [
  { value: 'google/gemma-4-26b-a4b-it:free',        label: 'Gemma 4 26B A4B (Free) — Recommended' },
  { value: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B (Free)' },
  { value: 'deepseek/deepseek-chat',              label: 'DeepSeek Chat'              },
  { value: 'openai/gpt-4o-mini',                  label: 'GPT-4o Mini'                },
  { value: 'anthropic/claude-3.5-sonnet',          label: 'Claude 3.5 Sonnet'          },
  { value: 'google/gemini-pro',                    label: 'Gemini Pro'                 },
];

export const OPENROUTER_RERANK_MODELS = [
  {
    value: DEFAULT_RERANK_MODEL,
    label: 'Llama Nemotron Rerank VL 1B V2 (Free)',
  },
];

export const OPENAI_MODELS = [
  { value: 'gpt-4o',      label: 'GPT-4o'           },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini'       },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo'       },
];


export function getAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw) as Partial<AiSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    // Migrate browsers that still hold the previous built-in default while
    // preserving their API key and all other preferences.
    if (
      saved.model === 'nvidia/nemotron-3-nano-30b-a3b:free'
      && !saved.customModel?.trim()
    ) {
      merged.model = DEFAULT_OPENROUTER_MODEL;
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getActiveModel(settings: AiSettings): string {
  if (settings.model === CUSTOM_MODEL_VALUE) return settings.customModel.trim();
  return settings.customModel.trim() || settings.model;
}

export function getActiveRerankModel(settings: AiSettings): string {
  if (settings.rerankModel === CUSTOM_MODEL_VALUE) return settings.customRerankModel.trim();
  return settings.customRerankModel.trim() || settings.rerankModel;
}

export function getActiveApiKey(settings: AiSettings): string {
  if (settings.provider === 'openai') return settings.openAiApiKey;
  return settings.openRouterApiKey;
}

export function getModelLabel(settings: AiSettings): string {
  const model = getActiveModel(settings);
  const list = settings.provider === 'openai' ? OPENAI_MODELS : OPENROUTER_MODELS;
  return list.find(m => m.value === model)?.label ?? model.split('/').pop() ?? model;
}

function getApiBase(provider: AiSettings['provider']): string {
  if (provider === 'openai') return 'https://api.openai.com/v1';
  if (provider === 'local')  return 'http://localhost:11434/v1';
  return 'https://openrouter.ai/api/v1';
}

type RerankResult = { index?: number; relevance_score?: number };

/**
 * Use OpenRouter's rerank endpoint to select the session records most relevant
 * to the user's question. Employee-level aggregates are always retained so a
 * focused retrieval cannot distort workforce-wide totals. If reranking is
 * unavailable, the caller falls back to the complete original context.
 */
async function rerankTelemetryContext(
  question: string,
  context: object,
  settings: AiSettings,
  headers: Record<string, string>,
): Promise<object> {
  if (settings.provider !== 'openrouter' || !settings.useReranking) return context;

  const rag = context as {
    query_date?: string;
    total_sessions?: number;
    employees?: Array<Record<string, unknown> & { sessions?: unknown[] }>;
  };
  if (!Array.isArray(rag.employees)) return context;

  const candidates = rag.employees.flatMap(employee => {
    const { sessions = [], ...employeeSummary } = employee;
    return sessions.map(session => ({ employee: employeeSummary, session }));
  });
  if (candidates.length < 2) return context;

  const model = getActiveRerankModel(settings);
  if (!model) return context;

  const res = await fetch('https://openrouter.ai/api/v1/rerank', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      query: question,
      documents: candidates.map(candidate => JSON.stringify(candidate)),
      top_n: Math.min(8, candidates.length),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Rerank API error ${res.status}`);

  const payload = await res.json() as { results?: RerankResult[] };
  const selected = (payload.results ?? [])
    .filter(result => Number.isInteger(result.index) && result.index! >= 0 && result.index! < candidates.length)
    .map(result => ({
      ...candidates[result.index!],
      relevance_score: result.relevance_score ?? null,
    }));
  if (!selected.length) return context;

  return {
    query_date: rag.query_date,
    total_sessions: rag.total_sessions,
    employees: rag.employees.map(({ sessions: _sessions, ...employee }) => employee),
    retrieval: {
      model,
      candidate_count: candidates.length,
      selected_sessions: selected,
    },
  };
}

export async function askAiAgent(
  question: string,
  context: object,
  settings?: AiSettings
): Promise<string> {
  const s = settings ?? getAiSettings();
  const apiKey = getActiveApiKey(s);

  if (!apiKey.trim() && s.provider !== 'local') {
    throw new Error(
      'AI is not configured. Please add your API key in Settings.'
    );
  }

  const base  = getApiBase(s.provider);
  const model = getActiveModel(s);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (s.provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'TELER Dashboard';
  }

  let preparedContext = context;
  try {
    preparedContext = await rerankTelemetryContext(question, context, s, headers);
  } catch {
    // Reranking improves relevance but must never make the assistant unavailable.
    preparedContext = context;
  }

  const body = {
    model,
    temperature: s.temperature,
    max_tokens: s.maxTokens,
    messages: [
      { role: 'system', content: s.systemPrompt },
      {
        role: 'system',
        content: `Workforce telemetry context (JSON):\n${JSON.stringify(preparedContext, null, 2)}`,
      },
      { role: 'user', content: question },
    ],
  };

  const res = await fetch(`${base}/chat/completions`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`AI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI API.');
  return content as string;
}
