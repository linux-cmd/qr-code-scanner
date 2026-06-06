import { getCachedAiAnalysis } from '../_lib/ai';
import { enforceRateLimit } from '../_lib/rateLimit';
import { readJsonBody, error, json } from '../_lib/response';
import { normalizeUrl } from '../_lib/safety';
import { verifyTurnstile } from '../_lib/turnstile';
import type { AppEnv, RiskLevel, SafetySignal } from '../_lib/types';

export const onRequestPost: PagesFunction<AppEnv> = async ({ request, env }) => {
  try {
    const body = await readJsonBody(request, 8192);
    const input = validateBody(body);

    await verifyTurnstile(env, bodyHasToken(body) ? body.turnstileToken : null, request);
    await enforceRateLimit({
      env,
      request,
      scope: 'ai-analysis',
      identifier: input.normalizedUrl,
      limit: 8,
      windowSeconds: 60 * 10
    });

    const result = await getCachedAiAnalysis(env, input);
    return json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'AI analysis failed.';
    const status = message.includes('Rate limit') ? 429 : 400;
    return error(message, status);
  }
};

function validateBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object.');
  }

  const record = body as Record<string, unknown>;
  if (typeof record.normalizedUrl !== 'string') {
    throw new Error('normalizedUrl is required.');
  }

  const normalizedUrl = normalizeUrl(record.normalizedUrl).toString();
  if (typeof record.riskScore !== 'number' || record.riskScore < 0 || record.riskScore > 100) {
    throw new Error('riskScore must be between 0 and 100.');
  }

  if (record.riskLevel !== 'low' && record.riskLevel !== 'caution' && record.riskLevel !== 'high' && record.riskLevel !== 'dangerous') {
    throw new Error('riskLevel must be low, caution, high, or dangerous.');
  }

  if (!Array.isArray(record.signals) || record.signals.length > 20) {
    throw new Error('signals must be a short array.');
  }

  const signals = record.signals.map(validateSignal);

  return {
    normalizedUrl,
    originalUrl: typeof record.originalUrl === 'string' ? record.originalUrl.slice(0, 2048) : undefined,
    finalUrl: typeof record.finalUrl === 'string' ? record.finalUrl.slice(0, 2048) : undefined,
    riskScore: record.riskScore,
    riskLevel: record.riskLevel as RiskLevel,
    confidence: typeof record.confidence === 'string' ? record.confidence.slice(0, 40) : undefined,
    confidenceWording: typeof record.confidenceWording === 'string' ? record.confidenceWording.slice(0, 260) : undefined,
    summaryLabel: typeof record.summaryLabel === 'string' ? record.summaryLabel.slice(0, 80) : undefined,
    recommendedAction: typeof record.recommendedAction === 'string' ? record.recommendedAction.slice(0, 220) : undefined,
    signals,
    threatIntel: Array.isArray(record.threatIntel) ? record.threatIntel.slice(0, 12) : undefined,
    limitations: Array.isArray(record.limitations) ? record.limitations.filter((item): item is string => typeof item === 'string').slice(0, 8) : undefined,
    redirectChain: Array.isArray(record.redirectChain) ? record.redirectChain.slice(0, 8) : undefined,
    title: typeof record.title === 'string' ? record.title.slice(0, 220) : undefined,
    description: typeof record.description === 'string' ? record.description.slice(0, 320) : undefined
  };
}

function validateSignal(value: unknown): SafetySignal {
  if (!value || typeof value !== 'object') {
    throw new Error('Each signal must be an object.');
  }

  const signal = value as Record<string, unknown>;
  if (signal.severity !== 'low' && signal.severity !== 'caution' && signal.severity !== 'high' && signal.severity !== 'dangerous') {
    throw new Error('Each signal needs a valid severity.');
  }

  return {
    key: typeof signal.key === 'string' ? signal.key.slice(0, 80) : 'signal',
    label: typeof signal.label === 'string' ? signal.label.slice(0, 240) : 'URL signal',
    severity: signal.severity,
    score: typeof signal.score === 'number' ? Math.max(0, Math.min(100, signal.score)) : 0,
    category:
      signal.category === 'transport' ||
      signal.category === 'host' ||
      signal.category === 'redirect' ||
      signal.category === 'content' ||
      signal.category === 'threat' ||
      signal.category === 'metadata'
        ? signal.category
        : 'metadata'
  };
}

function bodyHasToken(body: unknown): body is { turnstileToken?: string | null } {
  return Boolean(body && typeof body === 'object' && 'turnstileToken' in body);
}
