const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_EVIDENCE_MODEL = 'gemini-2.5-flash-lite';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function authorized(request: Request): boolean {
  const expected = process.env.TELER_API_TOKEN?.trim();
  const presented = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return Boolean(expected && presented && expected === presented);
}

function parseJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) as Record<string, unknown>; }
  catch { return {}; }
}

function requestedModel(body: Record<string, unknown>): string {
  return body.model === GEMINI_EVIDENCE_MODEL ? GEMINI_EVIDENCE_MODEL : 'openai/gpt-4o-mini';
}

function promptFor(mode: 'screenshot' | 'session'): string {
  return mode === 'screenshot'
    ? 'You analyse one work screenshot. Return ONLY JSON: {"summary":"observed facts only","confidence":0 to 1,"observed_signals":["short factual signals"]}. Never infer misconduct or productivity from one image. If unreadable or insufficient, say so with low confidence.'
    : 'You create an honest session report from telemetry and screenshot findings. Return ONLY JSON: {"summary":"concise evidence-backed report","confidence":0 to 1}. Distinguish observed facts from inference. Never claim productivity or misconduct where evidence is insufficient.';
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return noStoreJson({ error: 'Method not allowed' }, 405);
    if (!authorized(request)) return noStoreJson({ error: 'Unauthorized' }, 401);
    try {
      const body = await request.json() as Record<string, unknown>;
      const mode = body.mode === 'session' ? 'session' : 'screenshot';
      const model = requestedModel(body);
      const system = promptFor(mode);
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: mode === 'screenshot' ? `Metadata: ${JSON.stringify(body.metadata || {})}` : JSON.stringify({ telemetry: body.telemetry || {}, findings: body.findings || [] }) }];
      let image = '';
      if (mode === 'screenshot') {
        image = typeof body.image_base64 === 'string' ? body.image_base64 : '';
        if (!image || Buffer.byteLength(image, 'base64') > MAX_IMAGE_BYTES) return noStoreJson({ error: 'Invalid screenshot payload' }, 400);
        content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } });
      }

      if (model === GEMINI_EVIDENCE_MODEL) {
        const key = process.env.GEMINI_API_KEY?.trim();
        if (!key) return noStoreJson({ error: 'Gemini evidence analysis is not configured. Add GEMINI_API_KEY in Vercel.' }, 503);
        const parts: Array<Record<string, unknown>> = [{ text: system }, { text: mode === 'screenshot' ? `Metadata: ${JSON.stringify(body.metadata || {})}` : JSON.stringify({ telemetry: body.telemetry || {}, findings: body.findings || [] }) }];
        if (image) parts.push({ inlineData: { mimeType: 'image/png', data: image } });
        const upstream = await fetch(`${GEMINI_BASE}/models/${GEMINI_EVIDENCE_MODEL}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: mode === 'screenshot' ? 350 : 500 } }),
          signal: AbortSignal.timeout(40_000),
        });
        const payload = await upstream.json().catch(() => ({})) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };
        if (!upstream.ok) return noStoreJson({ error: payload.error?.message || `Gemini returned HTTP ${upstream.status}` }, upstream.status);
        const parsed = parseJson(payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '');
        if (typeof parsed.summary !== 'string') return noStoreJson({ error: 'Gemini returned an invalid structured report' }, 502);
        return noStoreJson({ ...parsed, model });
      }

      const key = process.env.OPENROUTER_API_KEY?.trim();
      if (!key) return noStoreJson({ error: 'OpenRouter is not configured' }, 503);
      const upstream = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': new URL(request.url).origin, 'X-Title': 'TELER Evidence AI' },
        body: JSON.stringify({ model, temperature: 0, max_tokens: mode === 'screenshot' ? 350 : 500, messages: [{ role: 'system', content: system }, { role: 'user', content }] }), signal: AbortSignal.timeout(40_000),
      });
      const payload = await upstream.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      if (!upstream.ok) return noStoreJson({ error: payload.error?.message || `AI provider returned HTTP ${upstream.status}` }, upstream.status);
      const parsed = parseJson(payload.choices?.[0]?.message?.content || '');
      if (typeof parsed.summary !== 'string') return noStoreJson({ error: 'AI returned an invalid structured report' }, 502);
      return noStoreJson({ ...parsed, model });
    } catch (error) {
      return noStoreJson({ error: error instanceof Error && error.name === 'TimeoutError' ? 'AI provider timed out' : 'Evidence analysis is unavailable' }, 502);
    }
  },
};
