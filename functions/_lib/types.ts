export type RiskLevel = 'low' | 'medium' | 'high';

export type SafetySignal = {
  key: string;
  label: string;
  severity: RiskLevel;
};

export type UrlCheckResult = {
  inputUrl: string;
  normalizedUrl: string;
  finalUrl: string;
  host: string;
  riskScore: number;
  riskLevel: RiskLevel;
  title?: string;
  description?: string;
  redirects: string[];
  signals: SafetySignal[];
  checkedAt: string;
};

export type AppEnv = {
  AI_PRIMARY_PROVIDER?: string;
  AI_PRIMARY_MODEL?: string;
  AI_FALLBACK_PROVIDER?: string;
  AI_FALLBACK_MODEL?: string;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_SAFE_BROWSING_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  AI_ANALYSIS_CACHE?: KVNamespace;
  RATE_LIMIT_KV?: KVNamespace;
};
