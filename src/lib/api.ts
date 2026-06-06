import type { AiAnalysisResult, ScanResult } from '../types';

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

export function scanUrl(url: string): Promise<ScanResult> {
  return postJson<ScanResult>('/api/scan', { url });
}

export function getAiAnalysis(args: Partial<ScanResult> & {
  turnstileToken?: string | null;
}): Promise<AiAnalysisResult> {
  return postJson<AiAnalysisResult>('/api/ai-analysis', args);
}

export function requestDeepScan(url: string): Promise<{ status: string; message: string; checkedAt?: string }> {
  return postJson('/api/deep-scan', { url });
}

export function sendFeedback(args: { scanId: string; message: string }): Promise<{ status: string; message: string }> {
  return postJson('/api/feedback', args);
}
