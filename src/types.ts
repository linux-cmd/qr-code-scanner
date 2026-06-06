export type Point = {
  x: number;
  y: number;
};

export type QrResult = {
  text: string;
  points: Point[];
  source: 'barcode-detector' | 'jsqr';
};

export type CropResult = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
};

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
  cacheStatus: {
    threatIntel: 'hit' | 'miss' | 'disabled' | 'partial';
    ai?: 'hit' | 'miss' | 'disabled';
  };
  aiAvailable: boolean;
  deepScanAvailable: boolean;
};

export type AiAnalysisResult = {
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
