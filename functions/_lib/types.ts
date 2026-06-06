export type RiskLevel = 'low' | 'caution' | 'high' | 'dangerous';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type SafetySignal = {
  key: string;
  label: string;
  severity: RiskLevel;
  score: number;
  category: 'transport' | 'host' | 'redirect' | 'content' | 'threat' | 'metadata';
};

export type RedirectHop = {
  url: string;
  status: number;
  method: 'HEAD' | 'GET';
  hostname: string;
  protocol: string;
};

export type ThreatIntelResult = {
  source: string;
  status: 'match' | 'no_match' | 'unavailable' | 'error' | 'rate_limited';
  threatType?: 'phishing' | 'malware' | 'unwanted_software' | 'suspicious';
  confidence: ConfidenceLevel;
  rawReference?: string;
  checkedAt: string;
  ttlSeconds: number;
  commercialUseStatus: 'verified' | 'requires_terms_verification' | 'disabled';
};

export type ScanCacheStatus = {
  threatIntel: 'hit' | 'miss' | 'disabled' | 'partial';
  ai?: 'hit' | 'miss' | 'disabled';
};

export type ScanResult = {
  scanId: string;
  originalUrl: string;
  normalizedUrl: string;
  finalUrl: string;
  canonicalCacheKey: string;
  domain: string;
  registrableDomain: string;
  hostname: string;
  displayHostname: string;
  path: string;
  query: string;
  title?: string;
  description?: string;
  redirectChain: RedirectHop[];
  riskScore: number;
  riskLevel: RiskLevel;
  confidence: ConfidenceLevel;
  confidenceWording: string;
  summaryLabel: 'No obvious risk detected' | 'Use caution' | 'High risk' | 'Dangerous';
  recommendedAction: string;
  signals: SafetySignal[];
  threatIntel: ThreatIntelResult[];
  limitations: string[];
  checkedAt: string;
  cacheStatus: ScanCacheStatus;
  aiAvailable: boolean;
  deepScanAvailable: boolean;
};

export type AppEnv = {
  AI_PRIMARY_PROVIDER?: string;
  AI_PRIMARY_MODEL?: string;
  AI_FALLBACK_PROVIDER?: string;
  AI_FALLBACK_MODEL?: string;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  THREAT_FEEDS_ENABLED?: string;
  PHISHTANK_ENABLED?: string;
  PHISHTANK_API_KEY?: string;
  URLHAUS_ENABLED?: string;
  CLOUDFLARE_RADAR_ENABLED?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  GOOGLE_WEB_RISK_ENABLED?: string;
  GOOGLE_WEB_RISK_API_KEY?: string;
  TURNSTILE_ENABLED?: string;
  TURNSTILE_SECRET_KEY?: string;
  DEEP_SCAN_ENABLED?: string;
  RATE_LIMIT_ENABLED?: string;
  ADSENSE_ENABLED?: string;
  ADSENSE_PUBLISHER_ID?: string;
  AI_ANALYSIS_CACHE?: KVNamespace;
  RATE_LIMIT_KV?: KVNamespace;
  THREAT_INTEL_CACHE?: KVNamespace;
};
