import type { ThreatIntelResult } from '../types';

export function ThreatIntelPanel({ results }: { results: ThreatIntelResult[] }) {
  if (results.length === 0) {
    return <p className="muted">No optional threat sources were queried.</p>;
  }

  return (
    <ul className="signals">
      {results.map((result) => (
        <li className={result.status === 'match' ? 'dangerous' : 'low'} key={`${result.source}-${result.status}`}>
          {formatThreatResult(result)}
        </li>
      ))}
    </ul>
  );
}

function formatThreatResult(result: ThreatIntelResult): string {
  if (result.commercialUseStatus === 'disabled') {
    return `Disabled: ${result.rawReference ?? 'External threat feeds disabled: This result used local URL and redirect checks only.'}`;
  }
  if (result.status === 'match') {
    return `Checked: match from ${result.source}.`;
  }
  if (result.status === 'no_match') {
    return `Checked: no match from ${result.source}. This does not guarantee the site is safe.`;
  }
  if (result.status === 'rate_limited') {
    return `Rate limited: ${result.source}.`;
  }
  if (result.status === 'error') {
    return `Error: ${result.source} could not be checked.`;
  }
  return `Not configured: ${result.rawReference ?? result.source}`;
}
