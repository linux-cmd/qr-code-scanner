import type { AppEnv, ThreatIntelResult } from '../types';
import type { NormalizedUrl } from '../url/normalize';
import { matchResult, noMatchResult, unavailableResult } from './providers';

type WebRiskThreatType = 'MALWARE' | 'SOCIAL_ENGINEERING' | 'UNWANTED_SOFTWARE';

type WebRiskSearchResponse = {
  threat?: {
    threatTypes?: WebRiskThreatType[];
    expireTime?: string;
  };
};

export async function lookupWebRisk(url: NormalizedUrl, env: AppEnv): Promise<ThreatIntelResult> {
  if (!env.GOOGLE_WEB_RISK_API_KEY) {
    return unavailableResult('google-web-risk', 'Google Web Risk key is not configured.');
  }

  const endpoint = new URL('https://webrisk.googleapis.com/v1/uris:search');
  endpoint.searchParams.append('threatTypes', 'MALWARE');
  endpoint.searchParams.append('threatTypes', 'SOCIAL_ENGINEERING');
  endpoint.searchParams.append('threatTypes', 'UNWANTED_SOFTWARE');
  endpoint.searchParams.set('uri', url.normalizedUrl);
  endpoint.searchParams.set('key', env.GOOGLE_WEB_RISK_API_KEY);

  const response = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' }
  }).catch(() => null);

  if (!response?.ok) {
    await logWebRiskFailure(response);
    return unavailableResult('google-web-risk', 'Google Web Risk lookup is unavailable.');
  }

  const payload = (await response.json()) as WebRiskSearchResponse;
  const threatTypes = payload.threat?.threatTypes ?? [];
  if (threatTypes.length === 0) {
    return noMatchResult('google-web-risk', 'No known threat-feed match found. This does not guarantee the site is safe.');
  }

  const strongest = strongestThreat(threatTypes);
  return matchResult('google-web-risk', threatTypeToResult(strongest), `Known threat-feed match found: ${strongest}.`);
}

async function logWebRiskFailure(response: Response | null) {
  if (!response) {
    console.warn('Google Web Risk lookup failed before receiving a response.');
    return;
  }
  const payload = (await response.clone().json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
  const status = payload?.error?.status ?? 'UNKNOWN';
  const message = payload?.error?.message ?? 'No Google error message returned.';
  console.warn(`Google Web Risk lookup failed: HTTP ${response.status} ${status}. ${message}`);
}

function strongestThreat(threatTypes: WebRiskThreatType[]): WebRiskThreatType {
  if (threatTypes.includes('MALWARE')) {
    return 'MALWARE';
  }
  if (threatTypes.includes('SOCIAL_ENGINEERING')) {
    return 'SOCIAL_ENGINEERING';
  }
  return 'UNWANTED_SOFTWARE';
}

function threatTypeToResult(threatType: WebRiskThreatType): NonNullable<ThreatIntelResult['threatType']> {
  if (threatType === 'MALWARE') {
    return 'malware';
  }
  if (threatType === 'SOCIAL_ENGINEERING') {
    return 'phishing';
  }
  return 'unwanted_software';
}
