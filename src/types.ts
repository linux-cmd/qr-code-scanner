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

export type AiAnalysisResult = {
  normalizedUrl: string;
  explanation: string;
  provider: string;
  model: string;
  cached: boolean;
  fallbackUsed: boolean;
};
