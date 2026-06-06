import { scoreScan } from './risk/scoring';
import { isBlockedHost } from './security/ssrf';
import { buildScanResult } from './scan';
import type { AppEnv, SafetySignal, ScanResult } from './types';
import { normalizeUrl as normalizeStructuredUrl } from './url/normalize';

export { isBlockedHost };

export function normalizeUrl(input: string): URL {
  return normalizeStructuredUrl(input).url;
}

export async function buildUrlCheck(inputUrl: string, env: AppEnv): Promise<ScanResult> {
  return buildScanResult(inputUrl, env);
}

export function scoreSignals(signals: SafetySignal[]): number {
  return scoreScan(signals, []).riskScore;
}

export function riskLevel(score: number) {
  return scoreScan([{ key: 'synthetic', label: 'Synthetic score', severity: 'low', score, category: 'metadata' }], []).riskLevel;
}
