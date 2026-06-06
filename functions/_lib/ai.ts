import { hashText } from './rateLimit';
import type { AppEnv, RiskLevel, SafetySignal } from './types';

export type AiAnalysisInput = {
  originalUrl?: string;
  normalizedUrl: string;
  finalUrl?: string;
  riskScore: number;
  riskLevel: RiskLevel;
  confidence?: string;
  confidenceWording?: string;
  summaryLabel?: string;
  recommendedAction?: string;
  signals: SafetySignal[];
  threatIntel?: unknown[];
  limitations?: string[];
  redirectChain?: unknown[];
  title?: string;
  description?: string;
};

export type AiAnalysisOutput = {
  normalizedUrl: string;
  shortDescription: string;
  riskExplanation: string;
  topReasons: string[];
  recommendedAction: string;
  confidenceWording: string;
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
  const signalHash = await hashText(JSON.stringify({ score: input.riskScore, level: input.riskLevel, signals: input.signals, threatIntel: input.threatIntel }));
  const cacheKey = `ai:v1:${await hashText(`${input.normalizedUrl}:${signalHash}`)}`;
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
    return providerAnalysis(input.normalizedUrl, primary.text, primaryProvider, primaryModel, false);
  }

  let fallbackAttempted = false;
  if ((primary.rateLimited || primary.status === 503 || primary.status === 500) && fallbackProvider === 'gemini' && fallbackModel) {
    fallbackAttempted = true;
    const fallback = await callGemini(env, fallbackModel, prompt);
    if (fallback.ok && fallback.text) {
      return providerAnalysis(input.normalizedUrl, fallback.text, fallbackProvider, fallbackModel, true);
    }
  }

  return templateAnalysis(
    input,
    fallbackAttempted ? fallbackProvider ?? primaryProvider : primaryProvider,
    fallbackAttempted ? fallbackModel ?? primaryModel : primaryModel,
    fallbackAttempted
  );
}

function providerAnalysis(normalizedUrl: string, jsonText: string, provider: string, model: string, fallbackUsed: boolean): AiAnalysisOutput {
  const parsed = parseAiJson(jsonText);
  if (!parsed) {
    return {
      normalizedUrl,
      shortDescription: 'AI explanation is unavailable right now.',
      riskExplanation: 'The deterministic score and reason list are still available.',
      topReasons: [],
      recommendedAction: 'Use the deterministic result to decide whether to open the link.',
      confidenceWording: 'AI output could not be validated.',
      explanation: 'AI explanation is unavailable right now. The deterministic score and reason list are still available.',
      provider: `${provider}-template`,
      model,
      cached: false,
      fallbackUsed
    };
  }
  return {
    normalizedUrl,
    ...parsed,
    explanation: cleanExplanation(`${parsed.shortDescription} ${parsed.riskExplanation} ${parsed.recommendedAction}`),
    provider,
    model,
    cached: false,
    fallbackUsed
  };
}

export function buildPrompt(input: AiAnalysisInput): string {
  return JSON.stringify({
    instruction:
      'Return strict JSON only. Explain the structured URL scan result. Do not perform independent browsing. Do not invent facts. Do not label the destination as harmless or trustworthy. Do not change the score.',
    outputSchema: {
      shortDescription: 'string',
      riskExplanation: 'string',
      topReasons: ['string'],
      recommendedAction: 'string',
      confidenceWording: 'string'
    },
    rules: [
      'Use only the structured scan result.',
      'Do not browse independently or claim independent browsing.',
      'The scan is based on deterministic URL checks, redirect analysis, and any enabled threat-intelligence sources.',
      'If threat feeds are disabled, say: No external threat-feed lookup was performed.',
      'Mention redirects only when redirectChain contains a destination change.',
      'Do not change the risk score.',
      'Do not label the destination as harmless or trustworthy.'
    ],
    scanResult: input
  });
}

export function templateAnalysis(input: AiAnalysisInput, provider: string, model: string, fallbackUsed: boolean): AiAnalysisOutput {
  const strongest = input.signals.find((signal) => signal.severity === 'dangerous' || signal.severity === 'high') ?? input.signals.find((signal) => signal.score > 0);
  const shortDescription = templateShortDescription(input.riskLevel);
  const riskExplanation = strongest ? `Top reason: ${strongest.label}` : 'No obvious risk detected from local URL checks.';
  const recommendedAction = input.recommendedAction ?? templateAction(input.riskLevel);
  const confidenceWording = input.confidenceWording ?? `Confidence is ${input.confidence ?? 'low'} based on deterministic URL checks, redirect analysis, and any enabled threat-intelligence sources.`;
  const redirectNote =
    input.redirectChain && input.redirectChain.length > 1 && input.finalUrl && input.originalUrl && input.finalUrl !== input.originalUrl
      ? ` The destination changed through redirects before reaching the final URL: ${input.finalUrl}`
      : '';
  const threatDisabled = input.threatIntel?.some((item) => Boolean(item && typeof item === 'object' && (item as { commercialUseStatus?: unknown }).commercialUseStatus === 'disabled'))
    ? ' No external threat-feed lookup was performed.'
    : '';
  return {
    normalizedUrl: input.normalizedUrl,
    shortDescription,
    riskExplanation: `${riskExplanation}${redirectNote}${threatDisabled}`,
    topReasons: input.signals.slice(0, 4).map((signal) => signal.label),
    recommendedAction,
    confidenceWording,
    explanation: `${shortDescription} ${riskExplanation} ${recommendedAction}`,
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
          content:
            'You explain deterministic URL scan results clearly and cautiously. Return strict JSON only. Never label a site as harmless or trustworthy.'
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

function parseAiJson(value: string): Pick<AiAnalysisOutput, 'shortDescription' | 'riskExplanation' | 'topReasons' | 'recommendedAction' | 'confidenceWording'> | null {
  try {
    const cleaned = value.replace(/^```json\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (
      typeof parsed.shortDescription !== 'string' ||
      typeof parsed.riskExplanation !== 'string' ||
      !Array.isArray(parsed.topReasons) ||
      typeof parsed.recommendedAction !== 'string' ||
      typeof parsed.confidenceWording !== 'string'
    ) {
      return null;
    }
    return {
      shortDescription: sanitizeAiText(parsed.shortDescription, 220),
      riskExplanation: sanitizeAiText(parsed.riskExplanation, 420),
      topReasons: parsed.topReasons.filter((item): item is string => typeof item === 'string').map((item) => sanitizeAiText(item, 140)).slice(0, 5),
      recommendedAction: sanitizeAiText(parsed.recommendedAction, 220),
      confidenceWording: sanitizeAiText(parsed.confidenceWording, 220)
    };
  } catch {
    return null;
  }
}

function sanitizeAiText(value: string, maxLength: number): string {
  return value
    .replace(/does not involve browsing the URL|did not browse the URL|did not inspect the URL/gi, 'uses deterministic URL checks, redirect analysis, and any enabled threat-intelligence sources')
    .replace(/\bis safe\b/gi, 'has no obvious risk detected')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function templateShortDescription(riskLevel: RiskLevel): string {
  if (riskLevel === 'dangerous') {
    return 'Strong warning signs or a known threat match were found.';
  }
  if (riskLevel === 'high') {
    return 'Multiple warning signs were found.';
  }
  if (riskLevel === 'caution') {
    return 'Some URL patterns deserve caution.';
  }
  return 'No obvious risk detected from local URL checks. This is not a guarantee.';
}

function templateAction(riskLevel: RiskLevel): string {
  if (riskLevel === 'dangerous') {
    return 'Do not open this link unless you know exactly what it is.';
  }
  if (riskLevel === 'high') {
    return 'Avoid opening unless you fully trust the source.';
  }
  if (riskLevel === 'caution') {
    return 'Review the destination and reasons before opening.';
  }
  return 'Only open it if you trust the source of the QR code.';
}
