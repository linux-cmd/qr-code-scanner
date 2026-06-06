import { versionedHashKey } from './cache';
import { envFlag } from './env';
import { analyzeHeuristics } from './risk/heuristics';
import { scoreScan } from './risk/scoring';
import type { AppEnv, ScanResult } from './types';
import { normalizeUrl } from './url/normalize';
import { resolveRedirects } from './url/redirects';
import { lookupThreatIntel } from './threat/providers';

export async function buildScanResult(inputUrl: string, env: AppEnv): Promise<ScanResult> {
  const original = normalizeUrl(inputUrl);
  const redirectResolution = await resolveRedirects(original.url);
  const final = normalizeUrl(redirectResolution.finalUrl);
  const limitations = [...redirectResolution.limitations];
  limitations.push('This scanner reduces risk but cannot guarantee that any destination is safe.');

  const heuristicSignals = analyzeHeuristics({
    original,
    final,
    redirectChain: redirectResolution.redirectChain,
    limitations
  });

  const threatLookup = await lookupThreatIntel(final, env);
  const threatSignals = threatLookup.results
    .filter((result) => result.status === 'match')
    .map((result) => ({
      key: `knownThreatFeedMatch:${result.source}`,
      label: `Known threat-feed match found from ${result.source}.`,
      severity: 'dangerous' as const,
      score: result.threatType === 'phishing' ? 88 : result.threatType === 'malware' ? 90 : 85,
      category: 'threat' as const
    }));
  const signals = [...heuristicSignals, ...threatSignals];
  const score = scoreScan(signals, threatLookup.results);

  return {
    scanId: await versionedHashKey('scan:v1', `${final.normalizedUrl}:${Date.now()}`),
    originalUrl: original.originalUrl,
    normalizedUrl: original.normalizedUrl,
    finalUrl: final.normalizedUrl,
    canonicalCacheKey: final.canonicalCacheKey,
    domain: final.domain,
    registrableDomain: final.registrableDomain,
    hostname: final.hostname,
    displayHostname: final.displayHostname,
    path: final.path,
    query: final.query,
    title: redirectResolution.title,
    description: redirectResolution.description,
    redirectChain: redirectResolution.redirectChain,
    riskScore: score.riskScore,
    riskLevel: score.riskLevel,
    confidence: score.confidence,
    confidenceWording: score.confidenceWording,
    summaryLabel: score.summaryLabel,
    recommendedAction: score.recommendedAction,
    signals,
    threatIntel: threatLookup.results,
    limitations,
    checkedAt: new Date().toISOString(),
    cacheStatus: {
      threatIntel: threatLookup.cacheStatus
    },
    aiAvailable: Boolean(env.AI_PRIMARY_PROVIDER && env.AI_PRIMARY_MODEL && env.GROQ_API_KEY),
    deepScanAvailable: envFlag(env.DEEP_SCAN_ENABLED, false)
  };
}
