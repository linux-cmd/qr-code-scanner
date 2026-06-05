import { hashText } from './rateLimit';
import type { AppEnv, RiskLevel, SafetySignal } from './types';

export type AiAnalysisInput = {
  normalizedUrl: string;
  riskScore: number;
  riskLevel: RiskLevel;
  signals: SafetySignal[];
  title?: string;
  description?: string;
};

export type AiAnalysisOutput = {
  normalizedUrl: string;
  explanation: string;
  provider: string;
  model: string;
  cached: boolean;
  fallbackUsed: boolean;
};

type ProviderResult = {
  ok: boolean;
  text?: string;
  status?: number;
  rateLimited?: boolean;
};

export async function getCachedAiAnalysis(env: AppEnv, input: AiAnalysisInput): Promise<AiAnalysisOutput> {
  const cacheKey = `ai:${await hashText(input.normalizedUrl)}`;
  const cached = await env.AI_ANALYSIS_CACHE?.get(cacheKey, 'json');
  if (isCacheableAiOutput(cached)) {
    return {
      ...cached,
      cached: true
    };
  }

  const fresh = await createAiAnalysis(env, input);
  if (isProviderGenerated(fresh)) {
    await env.AI_ANALYSIS_CACHE?.put(cacheKey, JSON.stringify(fresh), { expirationTtl: 60 * 60 * 24 * 14 });
  }
  return fresh;
}

export async function createAiAnalysis(env: AppEnv, input: AiAnalysisInput): Promise<AiAnalysisOutput> {
  const primaryProvider = env.AI_PRIMARY_PROVIDER?.trim();
  const primaryModel = env.AI_PRIMARY_MODEL?.trim();
  const fallbackProvider = env.AI_FALLBACK_PROVIDER?.trim();
  const fallbackModel = env.AI_FALLBACK_MODEL?.trim();
  const prompt = buildPrompt(input);

  if (!primaryProvider || !primaryModel) {
    return templateAnalysis(input, 'unconfigured', 'unset', false);
  }

  if (primaryProvider !== 'groq') {
    return templateAnalysis(input, primaryProvider, primaryModel, false);
  }

  const primary = await callGroq(env, primaryModel, prompt);
  if (primary.ok && primary.text) {
    return {
      normalizedUrl: input.normalizedUrl,
      explanation: cleanExplanation(primary.text),
      provider: primaryProvider,
      model: primaryModel,
      cached: false,
      fallbackUsed: false
    };
  }

  if (primary.rateLimited && fallbackProvider === 'gemini' && fallbackModel) {
    const fallback = await callGemini(env, fallbackModel, prompt);
    if (fallback.ok && fallback.text) {
      return {
        normalizedUrl: input.normalizedUrl,
        explanation: cleanExplanation(fallback.text),
        provider: fallbackProvider,
        model: fallbackModel,
        cached: false,
        fallbackUsed: true
      };
    }
  }

  return templateAnalysis(
    input,
    primary.rateLimited ? fallbackProvider ?? primaryProvider : primaryProvider,
    primary.rateLimited ? fallbackModel ?? primaryModel : primaryModel,
    Boolean(primary.rateLimited)
  );
}

export function buildPrompt(input: AiAnalysisInput): string {
  const signals = input.signals.map((signal) => `- ${signal.severity}: ${signal.label}`).join('\n');
  return [
    'Write a short user-facing QR URL explanation in 2 sentences or fewer.',
    'Use only the provided deterministic signals. Do not claim the URL is safe.',
    `URL: ${input.normalizedUrl}`,
    `Risk: ${input.riskLevel} (${input.riskScore}/100)`,
    input.title ? `Page title: ${input.title}` : '',
    input.description ? `Page description: ${input.description}` : '',
    'Signals:',
    signals || '- low: No notable signals were provided.'
  ]
    .filter(Boolean)
    .join('\n');
}

export function templateAnalysis(input: AiAnalysisInput, provider: string, model: string, fallbackUsed: boolean): AiAnalysisOutput {
  const strongest = input.signals.find((signal) => signal.severity === 'high') ?? input.signals.find((signal) => signal.severity === 'medium');
  const detail = strongest ? ` The most important signal is: ${strongest.label}` : ' No major deterministic warning signal was found.';
  return {
    normalizedUrl: input.normalizedUrl,
    explanation: `This URL currently has a ${input.riskLevel} deterministic risk score of ${input.riskScore}/100.${detail}`,
    provider: `${provider}-template`,
    model,
    cached: false,
    fallbackUsed
  };
}

async function callGroq(env: AppEnv, model: string, prompt: string): Promise<ProviderResult> {
  if (!env.GROQ_API_KEY) {
    return { ok: false, status: 401 };
  }

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GROQ_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You explain deterministic URL safety signals clearly and cautiously.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 120
    })
  });

  if (!response.ok) {
    return { ok: false, status: response.status, rateLimited: response.status === 429 };
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return { ok: true, text: payload.choices?.[0]?.message?.content };
}

async function callGemini(env: AppEnv, model: string, prompt: string): Promise<ProviderResult> {
  if (!env.GEMINI_API_KEY) {
    return { ok: false, status: 401 };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
    env.GEMINI_API_KEY
  )}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 120
      }
    })
  });

  if (!response.ok) {
    return { ok: false, status: response.status, rateLimited: response.status === 429 };
  }

  const payload = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return {
    ok: true,
    text: payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join(' ')
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch {
    return new Response(null, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

function cleanExplanation(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 420);
}

function isCacheableAiOutput(value: unknown): value is AiAnalysisOutput {
  return isAiOutput(value) && isProviderGenerated(value);
}

function isProviderGenerated(value: AiAnalysisOutput): boolean {
  return !value.provider.endsWith('-template');
}

function isAiOutput(value: unknown): value is AiAnalysisOutput {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'explanation' in value &&
      'normalizedUrl' in value &&
      'provider' in value &&
      typeof (value as { provider?: unknown }).provider === 'string'
  );
}
