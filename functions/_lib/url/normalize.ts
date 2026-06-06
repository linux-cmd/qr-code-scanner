export type NormalizedUrl = {
  originalUrl: string;
  normalizedUrl: string;
  canonicalCacheKey: string;
  domain: string;
  registrableDomain: string;
  hostname: string;
  displayHostname: string;
  path: string;
  query: string;
  url: URL;
};

const trackingParams = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term'
]);

export function normalizeUrl(input: string): NormalizedUrl {
  const originalUrl = input.trim();
  if (!originalUrl || originalUrl.length > 4096 || /\s/.test(originalUrl)) {
    throw new Error('Enter a valid URL.');
  }

  const withScheme = /^[a-z][a-z\d+\-.]*:/i.test(originalUrl) ? originalUrl : `https://${originalUrl}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs can be scanned.');
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  if (!url.pathname) {
    url.pathname = '/';
  }

  const cacheUrl = new URL(url.toString());
  for (const key of Array.from(cacheUrl.searchParams.keys())) {
    if (trackingParams.has(key.toLowerCase())) {
      cacheUrl.searchParams.delete(key);
    }
  }

  return {
    originalUrl,
    normalizedUrl: url.toString(),
    canonicalCacheKey: cacheUrl.toString(),
    domain: url.hostname,
    registrableDomain: approximateRegistrableDomain(url.hostname),
    hostname: url.hostname,
    displayHostname: displayHostname(url.hostname),
    path: url.pathname,
    query: url.search,
    url
  };
}

export function approximateRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (parts.length <= 2) {
    return parts.join('.');
  }

  const knownSecondLevel = new Set(['co', 'com', 'net', 'org', 'gov', 'ac']);
  const last = parts.at(-1) ?? '';
  const secondLast = parts.at(-2) ?? '';
  if (last.length === 2 && knownSecondLevel.has(secondLast) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function displayHostname(hostname: string): string {
  try {
    return hostname
      .split('.')
      .map((part) => (part.startsWith('xn--') ? decodePunycodeLabel(part) : part))
      .join('.');
  } catch {
    return hostname;
  }
}

function decodePunycodeLabel(label: string): string {
  // Workers do not expose a full punycode decoder. Keep the original label rather than guessing.
  return label;
}
