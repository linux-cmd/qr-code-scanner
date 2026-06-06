import type { ConfidenceLevel, RiskLevel, SafetySignal, ThreatIntelResult } from '../types';

export function scoreScan(signals: SafetySignal[], threatIntel: ThreatIntelResult[]) {
  const additive = signals.reduce((total, signal) => total + signal.score, 0);
  const minimum = minimumScore(signals, threatIntel);
  const riskScore = Math.min(100, Math.max(additive, minimum));
  const riskLevel = riskLevelForScore(riskScore);

  return {
    riskScore,
    riskLevel,
    confidence: confidenceFor(riskLevel, signals, threatIntel),
    confidenceWording: confidenceWordingFor(riskScore, riskLevel, signals, threatIntel),
    summaryLabel: summaryLabelFor(riskLevel),
    recommendedAction: recommendedActionFor(riskLevel)
  };
}

export function riskLevelForScore(score: number): RiskLevel {
  if (score >= 81) {
    return 'dangerous';
  }
  if (score >= 51) {
    return 'high';
  }
  if (score >= 21) {
    return 'caution';
  }
  return 'low';
}

function minimumScore(signals: SafetySignal[], threatIntel: ThreatIntelResult[]): number {
  let minimum = signals.some((signal) => signal.key === 'localhostOrPrivateIp') ? 95 : 0;
  for (const result of threatIntel) {
    if (result.status !== 'match') {
      continue;
    }
    if (result.threatType === 'phishing') {
      minimum = Math.max(minimum, 88);
    } else if (result.threatType === 'malware') {
      minimum = Math.max(minimum, 90);
    } else {
      minimum = Math.max(minimum, 85);
    }
  }
  return minimum;
}

function confidenceFor(riskLevel: RiskLevel, signals: SafetySignal[], threatIntel: ThreatIntelResult[]): ConfidenceLevel {
  if (threatIntel.some((result) => result.status === 'match' && result.confidence === 'high')) {
    return 'high';
  }
  if (riskLevel === 'high' || riskLevel === 'dangerous') {
    return 'high';
  }
  if (signals.filter((signal) => signal.score >= 25).length >= 2 || signals.some((signal) => signal.score >= 80)) {
    return 'high';
  }
  if (signals.some((signal) => signal.score > 0) || threatIntel.some((result) => result.status === 'no_match')) {
    return 'medium';
  }
  return 'low';
}

function confidenceWordingFor(riskScore: number, riskLevel: RiskLevel, signals: SafetySignal[], threatIntel: ThreatIntelResult[]): string {
  if (threatIntel.some((result) => result.status === 'match')) {
    return 'Confidence: high because a configured threat-intelligence source reported a match.';
  }
  if (riskLevel === 'high' || riskLevel === 'dangerous') {
    return 'Confidence: high because multiple strong risk signals were detected.';
  }
  if (riskScore === 0 && threatIntel.every((result) => result.commercialUseStatus === 'disabled')) {
    return 'Confidence: low because external threat feeds are disabled. No obvious risk was found in local URL and redirect checks.';
  }
  if (riskLevel === 'low' && threatIntel.some((result) => result.status === 'no_match')) {
    return 'Confidence: medium. No obvious risk was found in local URL, redirect, and enabled threat-intelligence checks.';
  }
  if (signals.some((signal) => signal.score > 0)) {
    return 'Confidence: medium because deterministic URL and redirect checks found review-worthy signals.';
  }
  return 'Confidence: low because this result is based on local URL and redirect checks only.';
}

function summaryLabelFor(riskLevel: RiskLevel) {
  if (riskLevel === 'dangerous') {
    return 'Dangerous' as const;
  }
  if (riskLevel === 'high') {
    return 'High risk' as const;
  }
  if (riskLevel === 'caution') {
    return 'Use caution' as const;
  }
  return 'No obvious risk detected' as const;
}

function recommendedActionFor(riskLevel: RiskLevel): string {
  if (riskLevel === 'dangerous') {
    return 'Do not open this link unless you know exactly what it is.';
  }
  if (riskLevel === 'high') {
    return 'Avoid opening unless you fully trust the source of the QR code.';
  }
  if (riskLevel === 'caution') {
    return 'Review the destination and warning signs before opening.';
  }
  return 'Only open it if you trust the source of the QR code.';
}
