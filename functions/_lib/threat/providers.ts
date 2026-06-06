import { readKvJson, versionedHashKey, writeKvJson } from '../cache';
import { envFlag } from '../env';
import type { AppEnv, ThreatIntelResult } from '../types';
import type { NormalizedUrl } from '../url/normalize';
import { isBlockedHost } from '../security/ssrf';
import { lookupWebRisk } from './webRisk';

export type ThreatProvider = {
  name: string;
  enabled: boolean;
  commercialUseStatus: ThreatIntelResult['commercialUseStatus'];
  lookupUrl(url: NormalizedUrl, env: AppEnv): Promise<ThreatIntelResult>;
  lookupDomain(domain: string, env: AppEnv): Promise<ThreatIntelResult>;
};

const defaultNoMatchTtl = 60 * 60;
const defaultUnavailableTtl = 15 * 60;

export async function lookupThreatIntel(url: NormalizedUrl, env: AppEnv): Promise<{ results: ThreatIntelResult[]; cacheStatus: 'hit' | 'miss' | 'disabled' | 'partial' }> {
  if (!envFlag(env.THREAT_FEEDS_ENABLED, false)) {
    return {
      results: [disabledResult('external-threat-feeds', 'External threat feeds disabled: This result used local URL and redirect checks only.')],
      cacheStatus: 'disabled'
    };
  }

  if (isBlockedHost(url.hostname)) {
    return {
      results: [unavailableResult('threat-feeds', 'Private or internal URLs are not submitted to public threat providers.')],
      cacheStatus: 'disabled'
    };
  }

  const cacheKey = await versionedHashKey('threat:v1:url', url.canonicalCacheKey);
  const cached = await readKvJson<ThreatIntelResult[]>(env.THREAT_INTEL_CACHE, cacheKey);
  if (cached) {
    return { results: cached, cacheStatus: 'hit' };
  }

  const providers = enabledProviders(env);
  if (providers.length === 0) {
    return {
      results: [disabledResult('external-threat-feeds', 'External threat feeds disabled: This result used local URL and redirect checks only.')],
      cacheStatus: 'disabled'
    };
  }

  const results = await Promise.all(providers.map((provider) => provider.lookupUrl(url, env).catch(() => unavailableResult(provider.name))));
  const ttl = results.some((result) => result.status === 'match') ? 6 * 60 * 60 : defaultNoMatchTtl;
  await writeKvJson(env.THREAT_INTEL_CACHE, cacheKey, results, ttl);

  return {
    results,
    cacheStatus: 'miss'
  };
}

function enabledProviders(env: AppEnv): ThreatProvider[] {
  return [
    localListProvider(),
    disabledTermsProvider('phishtank', envFlag(env.PHISHTANK_ENABLED, false)),
    disabledTermsProvider('urlhaus', envFlag(env.URLHAUS_ENABLED, false)),
    disabledTermsProvider('cloudflare-radar', envFlag(env.CLOUDFLARE_RADAR_ENABLED, false)),
    webRiskProvider(envFlag(env.GOOGLE_WEB_RISK_ENABLED, false))
  ].filter((provider) => provider.enabled);
}

function localListProvider(): ThreatProvider {
  return {
    name: 'local-lists',
    enabled: true,
    commercialUseStatus: 'verified',
    async lookupUrl(url) {
      const blocked = ['malware.test', 'phishing.test'];
      if (blocked.includes(url.hostname)) {
        return matchResult('local-lists', url.hostname === 'malware.test' ? 'malware' : 'phishing', 'Local test blocklist match.');
      }
      return noMatchResult('local-lists', 'No known local blocklist match found.');
    },
    async lookupDomain(domain) {
      return noMatchResult('local-lists', `No known local blocklist match found for ${domain}.`);
    }
  };
}

function webRiskProvider(enabled: boolean): ThreatProvider {
  return {
    name: 'google-web-risk',
    enabled,
    commercialUseStatus: 'requires_terms_verification',
    lookupUrl: lookupWebRisk,
    async lookupDomain() {
      return unavailableResult('google-web-risk', 'Google Web Risk lookup is URL-based in this implementation.');
    }
  };
}

function disabledTermsProvider(name: string, enabled: boolean): ThreatProvider {
  return {
    name,
    enabled,
    commercialUseStatus: 'requires_terms_verification',
    async lookupUrl() {
      return unavailableResult(name, `${name} requires terms verification before enabling in commercial mode.`);
    },
    async lookupDomain() {
      return unavailableResult(name, `${name} requires terms verification before enabling in commercial mode.`);
    }
  };
}

export function matchResult(source: string, threatType: NonNullable<ThreatIntelResult['threatType']>, rawReference?: string): ThreatIntelResult {
  return {
    source,
    status: 'match',
    threatType,
    confidence: 'high',
    rawReference,
    checkedAt: new Date().toISOString(),
    ttlSeconds: 6 * 60 * 60,
    commercialUseStatus: source === 'local-lists' ? 'verified' : 'requires_terms_verification'
  };
}

export function noMatchResult(source: string, rawReference?: string): ThreatIntelResult {
  return {
    source,
    status: 'no_match',
    confidence: 'low',
    rawReference,
    checkedAt: new Date().toISOString(),
    ttlSeconds: defaultNoMatchTtl,
    commercialUseStatus: source === 'local-lists' ? 'verified' : 'requires_terms_verification'
  };
}

export function unavailableResult(source: string, rawReference = 'Provider unavailable.'): ThreatIntelResult {
  return {
    source,
    status: 'unavailable',
    confidence: 'low',
    rawReference,
    checkedAt: new Date().toISOString(),
    ttlSeconds: defaultUnavailableTtl,
    commercialUseStatus: source === 'threat-feeds' ? 'disabled' : 'requires_terms_verification'
  };
}

function disabledResult(source: string, rawReference: string): ThreatIntelResult {
  return {
    source,
    status: 'unavailable',
    confidence: 'low',
    rawReference,
    checkedAt: new Date().toISOString(),
    ttlSeconds: defaultUnavailableTtl,
    commercialUseStatus: 'disabled'
  };
}
