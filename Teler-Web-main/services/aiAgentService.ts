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
    const merged = { ...DEFAULT_SETTINGS, ...saved, openRouterApiKey: '' };
    // Migrate browsers that still hold the previous built-in default while
    // preserving their API key and all other preferences.
    if (
      saved.model === 'nvidia/nemotron-3-nano-30b-a3b:free'
      && !saved.customModel?.trim()
    ) {
      merged.model = DEFAULT_OPENROUTER_MODEL;
    }
    if (saved.openRouterApiKey) localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, openRouterApiKey: '' }));
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
  if (settings.provider === 'openrouter') return '';
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

export async function askAiAgent(
  question: string,
  context: object,
  settings?: AiSettings
): Promise<string> {
  const s = settings ?? getAiSettings();
  const apiKey = getActiveApiKey(s);

  if (s.provider === 'openrouter') {
    const response = await fetch('/api/ai', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        context,
        settings: {
          model: getActiveModel(s),
          useReranking: s.useReranking,
          rerankModel: getActiveRerankModel(s),
          temperature: s.temperature,
          maxTokens: s.maxTokens,
          systemPrompt: s.systemPrompt,
        },
      }),
      signal: AbortSignal.timeout(50_000),
    });
    const payload = await response.json().catch(() => ({})) as { answer?: unknown; error?: unknown };
    if (response.status === 401) window.dispatchEvent(new Event('teler:unauthorized'));
    if (!response.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : `TELER AI error ${response.status}`);
    }
    if (typeof payload.answer !== 'string' || !payload.answer.trim()) {
      throw new Error('TELER AI returned an empty response.');
    }
    return payload.answer;
  }

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

  const body = {
    model,
    temperature: s.temperature,
    max_tokens: s.maxTokens,
    messages: [
      { role: 'system', content: s.systemPrompt },
      {
        role: 'system',
        content: `Workforce telemetry context (JSON):\n${JSON.stringify(context, null, 2)}`,
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
