import { ExternalLink } from 'lucide-react';
import type { ScanResult as ScanResultType } from '../types';
import { LimitationsPanel } from './LimitationsPanel';
import { RedirectChain } from './RedirectChain';
import { RiskBadge } from './RiskBadge';
import { SignalList } from './SignalList';
import { ThreatIntelPanel } from './ThreatIntelPanel';

export function ScanResult({
  result,
  onDeepScan,
  onFeedback
}: {
  result: ScanResultType;
  onDeepScan: () => void;
  onFeedback: () => void;
}) {
  return (
    <div className="risk-report">
      <RiskBadge label={result.summaryLabel} level={result.riskLevel} score={result.riskScore} />
      <div className="meter-track">
        <span style={{ width: `${result.riskScore}%` }} />
      </div>
      <p className="site-title">{result.displayHostname}</p>
      <div className="url-pair">
        <span>Original QR URL:</span>
        <code>{result.originalUrl}</code>
      </div>
      <div className="url-pair">
        <span>Final destination after redirects:</span>
        <code>{result.finalUrl}</code>
      </div>
      <p className="muted">{result.confidenceWording} {result.recommendedAction}</p>
      {result.title ? <p className="site-title">{result.title}</p> : null}
      {result.description ? <p className="muted">{result.description}</p> : null}
      <a className="button secondary full open-link" href={result.finalUrl} rel="noopener noreferrer nofollow" target="_blank">
        <ExternalLink size={18} />
        Open URL
      </a>
      <div className="inline-actions">
        {result.deepScanAvailable ? (
          <button className="button secondary" onClick={onDeepScan} type="button">
            Deep scan
          </button>
        ) : null}
        <button className="button secondary" onClick={onFeedback} type="button">
          Report result
        </button>
      </div>
      <h3>Reasons</h3>
      <SignalList signals={result.signals} />
      <h3>Threat intelligence</h3>
      <ThreatIntelPanel results={result.threatIntel} />
      <h3>Redirects</h3>
      <RedirectChain finalUrl={result.finalUrl} hops={result.redirectChain} registrableDomain={result.registrableDomain} />
      <h3>Limitations</h3>
      <LimitationsPanel limitations={result.limitations} />
    </div>
  );
}
