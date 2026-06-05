import type { AiAnalysisResult, UrlCheckResult } from '../types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json().catch(() => ({}))) as { error?: string })
    : ({ error: 'API route is unavailable. Run `npm run dev:pages` for local AI and URL-check functions.' } as { error?: string });

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with ${response.status}`);
  }

  return payload as T;
}

export function checkUrl(url: string): Promise<UrlCheckResult> {
  return postJson<UrlCheckResult>('/api/url-check', { url });
}

export function getAiAnalysis(args: {
  normalizedUrl: string;
  riskScore: number;
  riskLevel: string;
  signals: unknown[];
  title?: string;
  description?: string;
  turnstileToken?: string | null;
}): Promise<AiAnalysisResult> {
  return postJson<AiAnalysisResult>('/api/ai-analysis', args);
}
