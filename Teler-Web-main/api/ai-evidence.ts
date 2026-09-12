const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
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

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return noStoreJson({ error: 'Method not allowed' }, 405);
    if (!authorized(request)) return noStoreJson({ error: 'Unauthorized' }, 401);
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) return noStoreJson({ error: 'OpenRouter is not configured' }, 503);
    try {
      const body = await request.json() as Record<string, unknown>;
      const mode = body.mode === 'session' ? 'session' : 'screenshot';
      const model = body.model === 'openai/gpt-4o-mini' ? body.model : 'openai/gpt-4o-mini';
      const system = mode === 'screenshot'
        ? 'You analyse one work screenshot. Return ONLY JSON: {"summary":"observed facts only","confidence":0 to 1,"observed_signals":["short factual signals"]}. Never infer misconduct or productivity from one image. If unreadable or insufficient, say so with low confidence.'
        : 'You create an honest session report from telemetry and screenshot findings. Return ONLY JSON: {"summary":"concise evidence-backed report","confidence":0 to 1}. Distinguish observed facts from inference. Never claim productivity or misconduct where evidence is insufficient.';
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: mode === 'screenshot' ? `Metadata: ${JSON.stringify(body.metadata || {})}` : JSON.stringify({ telemetry: body.telemetry || {}, findings: body.findings || [] }) }];
      if (mode === 'screenshot') {
        const image = typeof body.image_base64 === 'string' ? body.image_base64 : '';
        if (!image || Buffer.byteLength(image, 'base64') > MAX_IMAGE_BYTES) return noStoreJson({ error: 'Invalid screenshot payload' }, 400);
        content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } });
      }
      const upstream = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': new URL(request.url).origin, 'X-Title': 'TELER Evidence AI' },
        body: JSON.stringify({ model, temperature: 0, max_tokens: mode === 'screenshot' ? 350 : 500, messages: [{ role: 'system', content: system }, { role: 'user', content }] }), signal: AbortSignal.timeout(40_000),
      });
      const payload = await upstream.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      if (!upstream.ok) return noStoreJson({ error: payload.error?.message || `AI provider returned HTTP ${upstream.status}` }, upstream.status);
      const parsed = parseJson(payload.choices?.[0]?.message?.content || '');
      if (typeof parsed.summary !== 'string') return noStoreJson({ error: 'AI returned an invalid structured report' }, 502);
      return noStoreJson(parsed);
    } catch (error) {
      return noStoreJson({ error: error instanceof Error && error.name === 'TimeoutError' ? 'AI provider timed out' : 'Evidence analysis is unavailable' }, 502);
    }
  },
};
