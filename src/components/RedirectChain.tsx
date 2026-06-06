import type { RedirectHop } from '../types';

export function RedirectChain({ hops, finalUrl, registrableDomain }: { hops: RedirectHop[]; finalUrl: string; registrableDomain: string }) {
  const redirected = hops.length > 1 || (hops[0] && hops[0].url !== finalUrl);
  const changedDomain = hops.some((hop) => !sameRegistrableDomain(hop.hostname, registrableDomain));

  if (!redirected) {
    return <p className="muted">No redirects detected. Final destination: {finalUrl}</p>;
  }

  return (
    <details className="details-block" open>
      <summary>Redirect chain detected</summary>
      <p className="muted">{changedDomain ? 'Redirects changed destination domain.' : 'Redirects stayed within the same site.'}</p>
      <ol>
        {hops.map((hop, index) => (
          <li key={`${hop.status}-${hop.url}`}>
            Step {index + 1}: {hop.url} ({hop.status} {hop.method})
          </li>
        ))}
        <li>Final: {finalUrl}</li>
      </ol>
    </details>
  );
}

function sameRegistrableDomain(hostname: string, registrableDomain: string): boolean {
  return hostname === registrableDomain || hostname.endsWith(`.${registrableDomain}`);
}
