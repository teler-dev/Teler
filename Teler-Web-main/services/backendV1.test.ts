import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceSlug = 'abdul-quddus-s-workspace-3d3bca';
const workspaceId = 'f049ae22-e20b-43be-bfcf-fdc8dc52a1fa';
const employeeId = '1601714e-506a-4904-9eb3-568370234ebe';
const sessionId = 'bbc98bc1-4fd6-434b-935b-95bd2d3d9216';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('normalized v1 session sync', () => {
  it('offers free OpenRouter models and the managed GPT-4o Mini option', async () => {
    const { OPENROUTER_MODELS } = await import('./aiAgentService');
    expect(OPENROUTER_MODELS).not.toHaveLength(0);
    expect(OPENROUTER_MODELS.every(({ value }) => value.endsWith(':free'))).toBe(true);

    const { OPENAI_MODELS } = await import('./aiAgentService');
    expect(OPENAI_MODELS).toEqual([{ value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' }]);

    const { isFreeOpenRouterModel, isSupportedOpenAiModel } = await import('../api/ai');
    expect(isFreeOpenRouterModel('google/gemma-4-26b-a4b-it:free')).toBe(true);
    expect(isSupportedOpenAiModel('gpt-4o-mini')).toBe(true);
    expect(isSupportedOpenAiModel('gpt-4o')).toBe(false);
  });

  it('uses the configured workspace and maps screenshot evidence into the website session', async () => {
    vi.stubEnv('VITE_ORGANIZATION_KEY', workspaceSlug);
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'https://teler.test');
      const target = url.searchParams.get('target') || '';
      requests.push(target);
      if (target.startsWith('/api/v1/companies?')) {
        return Response.json({ data: [{ id: workspaceId, slug: workspaceSlug, name: "Abdul Quddus's workspace", status: 'active' }] });
      }
      if (target.includes(`/companies/${workspaceId}/employees`)) {
        return Response.json({ data: [{ id: employeeId, external_key: 'abdul-quddus', display_name: 'Abdul Quddus', job_role: 'general', status: 'active' }] });
      }
      if (target.startsWith('/api/v1/sessions?')) {
        return Response.json({ data: [{
          id: sessionId,
          external_session_id: `control:${sessionId}`,
          employee_id: employeeId,
          employee_name: 'Abdul Quddus',
          started_at: '2026-09-11T03:14:58.449Z',
          ended_at: '2026-09-11T03:16:43.526Z',
          total_minutes: '1.75', status: 'complete', screenshots: [{ id: 'shot-1', session_id: sessionId }],
        }] });
      }
      if (target.startsWith('/api/v1/alerts?')) return Response.json({ data: [] });
      throw new Error(`Unexpected request: ${target}`);
    }));

    const { fetchAndMergeV1Sessions } = await import('./backendV1');
    const sessions = await fetchAndMergeV1Sessions([]);

    expect(requests[0]).toContain(`key=${workspaceSlug}`);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: `control:${sessionId}`, userName: 'Abdul Quddus', role: 'general' });
    expect(sessions[0].evidence?.screenshot_count).toBe(1);
    expect(sessions[0].evidence?.screenshot_urls).toEqual(['/api/v1/screenshots/shot-1/content']);
  });

  it('keeps protected screenshot URLs behind the same-origin API proxy', async () => {
    const { screenshotUrl } = await import('./apiConfig');
    expect(screenshotUrl('/api/v1/screenshots/shot-1/content'))
      .toBe('/api/teler?target=%2Fapi%2Fv1%2Fscreenshots%2Fshot-1%2Fcontent');
  });
});
