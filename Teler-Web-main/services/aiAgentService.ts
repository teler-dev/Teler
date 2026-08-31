export interface AiSettings {
  provider: 'openrouter' | 'openai' | 'local';
  model: string;
  customModel: string;
  openRouterApiKey: string;
  openAiApiKey: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export const STORAGE_KEY = 'teler_ai_settings';

export const DEFAULT_SYSTEM_PROMPT =
  'You are TELER AI, a workforce intelligence assistant.\n\n' +
  'Answer questions about employee sessions, productivity, alerts, and activities using the provided telemetry data.\n\n' +
  'Never hallucinate data. If records are missing respond with "No records found".';

export const DEFAULT_SETTINGS: AiSettings = {
  provider: 'openrouter',
  model: 'nvidia/nemotron-3-nano-30b-a3b:free',
  customModel: '',
  openRouterApiKey: '',
  openAiApiKey: '',
  temperature: 0.2,
  maxTokens: 2000,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

export const OPENROUTER_MODELS = [
  { value: 'nvidia/nemotron-3-nano-30b-a3b:free', label: 'Nemotron 3 Nano 30B (Free)' },
  { value: 'deepseek/deepseek-chat',              label: 'DeepSeek Chat'              },
  { value: 'openai/gpt-4o-mini',                  label: 'GPT-4o Mini'                },
  { value: 'anthropic/claude-3.5-sonnet',          label: 'Claude 3.5 Sonnet'          },
  { value: 'google/gemini-pro',                    label: 'Gemini Pro'                 },
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
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function getActiveModel(settings: AiSettings): string {
  return settings.customModel.trim() || settings.model;
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
