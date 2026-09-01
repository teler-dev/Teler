import { noStoreJson, readSession, unauthorized } from './_auth.js';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MAX_CONTEXT_BYTES = 750_000;
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]{1,160}$/i;

type AiRequest = {
  question?: unknown;
  context?: unknown;
  settings?: {
    model?: unknown;
    useReranking?: unknown;
    rerankModel?: unknown;
    temperature?: unknown;
    maxTokens?: unknown;
    systemPrompt?: unknown;
  };
};

type RerankResult = { index?: number; relevance_score?: number };

function providerError(payload: unknown, fallback: string): string {
  const message = (payload as { error?: { message?: unknown } })?.error?.message;
  return typeof message === 'string' && message.trim()
    ? message.trim().slice(0, 400)
    : fallback;
}

async function readProviderBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function rerankContext(
  question: string,
  context: Record<string, unknown>,
  model: string,
  apiKey: string,
  appOrigin: string,
): Promise<Record<string, unknown>> {
  const employees = Array.isArray(context.employees)
    ? context.employees as Array<Record<string, unknown> & { sessions?: unknown[] }>
    : [];
  const candidates = employees.flatMap((employee) => {
    const { sessions = [], ...employeeSummary } = employee;
    return Array.isArray(sessions)
      ? sessions.map((session) => ({ employee: employeeSummary, session }))
      : [];
  });
  if (candidates.length < 2) return context;

  const response = await fetch(`${OPENROUTER_BASE}/rerank`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': appOrigin,
      'X-Title': 'TELER Dashboard',
    },
    body: JSON.stringify({
      model,
      query: question,
      documents: candidates.map((candidate) => JSON.stringify(candidate)),
      top_n: Math.min(8, candidates.length),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return context;

  const payload = await readProviderBody(response) as { results?: RerankResult[] } | null;
  const selected = (payload?.results ?? [])
    .filter((result) => Number.isInteger(result.index) && result.index! >= 0 && result.index! < candidates.length)
    .map((result) => ({
      ...candidates[result.index!],
      relevance_score: result.relevance_score ?? null,
    }));
  if (!selected.length) return context;

  return {
    query_date: context.query_date,
    total_sessions: context.total_sessions,
    employees: employees.map(({ sessions: _sessions, ...employee }) => employee),
    retrieval: {
      model,
      candidate_count: candidates.length,
      selected_sessions: selected,
    },
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return noStoreJson({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    }

    try {
      if (!readSession(request)) return unauthorized();

      const apiKey = process.env.OPENROUTER_API_KEY?.trim();
      if (!apiKey) return noStoreJson({ error: 'OPENROUTER_API_KEY is not configured in Vercel' }, 503);

      let body: AiRequest;
      try {
        body = await request.json() as AiRequest;
      } catch {
        return noStoreJson({ error: 'Invalid JSON request' }, 400);
      }

      const question = typeof body.question === 'string' ? body.question.trim() : '';
      const model = typeof body.settings?.model === 'string' ? body.settings.model.trim() : '';
      const rerankModel = typeof body.settings?.rerankModel === 'string'
        ? body.settings.rerankModel.trim()
        : '';
      const systemPrompt = typeof body.settings?.systemPrompt === 'string'
        ? body.settings.systemPrompt.trim()
        : '';
      const temperature = typeof body.settings?.temperature === 'number'
        ? Math.min(1, Math.max(0, body.settings.temperature))
        : 0.2;
      const maxTokens = typeof body.settings?.maxTokens === 'number'
        ? Math.min(8_000, Math.max(256, Math.round(body.settings.maxTokens)))
        : 2_000;

      if (!question || question.length > 8_000) return noStoreJson({ error: 'Question is required' }, 400);
      if (!MODEL_ID_PATTERN.test(model)) return noStoreJson({ error: 'Invalid OpenRouter model ID' }, 400);
      if (!systemPrompt || systemPrompt.length > 12_000) return noStoreJson({ error: 'Invalid system prompt' }, 400);
      if (body.settings?.useReranking && !MODEL_ID_PATTERN.test(rerankModel)) {
        return noStoreJson({ error: 'Invalid rerank model ID' }, 400);
      }

      const context = body.context && typeof body.context === 'object'
        ? body.context as Record<string, unknown>
        : {};
      if (Buffer.byteLength(JSON.stringify(context), 'utf8') > MAX_CONTEXT_BYTES) {
        return noStoreJson({ error: 'Telemetry context is too large' }, 413);
      }

      const appOrigin = new URL(request.url).origin;
      const preparedContext = body.settings?.useReranking
        ? await rerankContext(question, context, rerankModel, apiKey, appOrigin)
        : context;

      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': appOrigin,
          'X-Title': 'TELER Dashboard',
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'system',
              content: `Workforce telemetry context (JSON):\n${JSON.stringify(preparedContext, null, 2)}`,
            },
            { role: 'user', content: question },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await readProviderBody(response);
      if (!response.ok) {
        console.error('OpenRouter error', response.status, providerError(payload, response.statusText));
        return noStoreJson(
          { error: providerError(payload, `OpenRouter returned HTTP ${response.status}`) },
          response.status === 401 || response.status === 402 || response.status === 429 ? response.status : 502,
        );
      }

      const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
        ?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        return noStoreJson({ error: 'OpenRouter returned an empty response' }, 502);
      }
      return noStoreJson({ answer: content });
    } catch (error) {
      console.error('TELER AI error', error);
      const message = error instanceof Error && error.name === 'TimeoutError'
        ? 'OpenRouter request timed out'
        : 'TELER AI is temporarily unavailable';
      return noStoreJson({ error: message }, 502);
    }
  },
};
