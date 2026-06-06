import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAiAnalysis, getCachedAiAnalysis, type AiAnalysisInput } from './ai';
import type { AppEnv } from './types';

const input: AiAnalysisInput = {
  normalizedUrl: 'https://example.com/',
  riskScore: 15,
  riskLevel: 'low',
  signals: [{ key: 'noObviousHeuristicRisk', label: 'No obvious risk detected from local URL checks.', severity: 'low', score: 0, category: 'metadata' }]
};

const baseEnv: AppEnv = {
  AI_PRIMARY_PROVIDER: 'groq',
  AI_PRIMARY_MODEL: 'primary-from-env',
  AI_FALLBACK_PROVIDER: 'gemini',
  AI_FALLBACK_MODEL: 'fallback-from-env',
  GROQ_API_KEY: 'groq-key',
  GEMINI_API_KEY: 'gemini-key'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI provider behavior', () => {
  it('uses Gemini only when Groq returns an explicit rate limit', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const nextUrl = String(url);
        calls.push(nextUrl);
        if (nextUrl.includes('groq.com')) {
          return new Response(null, { status: 429 });
        }
        return Response.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ shortDescription: 'Fallback summary.', riskExplanation: 'Fallback explanation.', topReasons: ['Reason'], recommendedAction: 'Review before opening.', confidenceWording: 'Medium confidence.' }) }] } }]
        });
      })
    );

    const result = await createAiAnalysis(baseEnv, input);

    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('fallback-from-env');
    expect(result.fallbackUsed).toBe(true);
    expect(calls.some((url) => url.includes('generativelanguage.googleapis.com'))).toBe(true);
  });

  it('uses Gemini fallback path when Groq has a provider failure', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const nextUrl = String(url);
        calls.push(nextUrl);
        return new Response(null, { status: 500 });
      })
    );

    const result = await createAiAnalysis(baseEnv, input);

    expect(result.provider).toBe('gemini-template');
    expect(result.fallbackUsed).toBe(true);
    expect(calls.some((url) => url.includes('generativelanguage.googleapis.com'))).toBe(true);
  });

  it('uses a deterministic template when provider env is missing', async () => {
    const result = await createAiAnalysis({}, input);

    expect(result.provider).toBe('unconfigured-template');
    expect(result.explanation).toContain('No obvious risk detected');
    expect(result.explanation).not.toMatch(/does not involve browsing the URL|did not browse the URL|did not inspect the URL/i);
    expect(result.explanation).not.toMatch(/\bis safe\b/i);
  });

  it('falls back to a deterministic template when provider JSON is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: 'not json' } }]
        })
      )
    );

    const result = await createAiAnalysis(baseEnv, input);

    expect(result.provider).toBe('groq-template');
    expect(result.riskExplanation).toContain('deterministic score');
  });

  it('does not reuse or write template fallback responses in the AI cache', async () => {
    const writes: string[] = [];
    const env: AppEnv = {
      AI_PRIMARY_PROVIDER: 'groq',
      AI_PRIMARY_MODEL: 'primary-from-env',
      AI_ANALYSIS_CACHE: {
        get: vi.fn(async () => ({
          normalizedUrl: input.normalizedUrl,
          explanation: 'stale template',
          provider: 'groq-template',
          model: 'primary-from-env',
          cached: false,
          fallbackUsed: false
        })),
        put: vi.fn(async (key: string) => {
          writes.push(key);
        })
      } as unknown as KVNamespace
    };

    const result = await getCachedAiAnalysis(env, input);

    expect(result.explanation).not.toBe('stale template');
    expect(result.provider).toBe('groq-template');
    expect(writes).toHaveLength(0);
  });
});
