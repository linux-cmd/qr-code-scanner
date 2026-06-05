import type { AppEnv, RiskLevel, SafetySignal, UrlCheckResult } from './types';

const maxRedirects = 4;
const metadataBytes = 64 * 1024;
const fetchTimeoutMs = 3500;
const shortenerHosts = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
  'cutt.ly',
  'rebrand.ly',
  'shorturl.at'
]);

type MetadataResult = {
  finalUrl: string;
  redirects: string[];
  title?: string;
  description?: string;
  fetchBlocked?: string;
};

type SafeBrowsingMatch = {
  threatType?: string;
  platformType?: string;
  threat?: {
    url?: string;
  };
};

export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) {
    throw new Error('Enter a valid URL.');
  }

  const withScheme = /^[a-z][a-z\d+\-.]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs can be checked.');
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  return url;
}

export async function buildUrlCheck(inputUrl: string, env: AppEnv): Promise<UrlCheckResult> {
  const normalized = normalizeUrl(inputUrl);
  const signals: SafetySignal[] = [];
  addStaticSignals(normalized, signals);

  const metadata = await resolveMetadata(normalized, signals);
  const final = normalizeUrl(metadata.finalUrl);
  if (metadata.fetchBlocked) {
    signals.push({
      key: 'metadata-blocked',
      label: metadata.fetchBlocked,
      severity: 'medium'
    });
  }

  if (metadata.redirects.length > 0) {
    signals.push({
      key: 'redirects',
      label: `Redirects ${metadata.redirects.length} time${metadata.redirects.length === 1 ? '' : 's'} before landing.`,
      severity: metadata.redirects.length > 2 ? 'medium' : 'low'
    });
  }

  if (final.hostname !== normalized.hostname) {
    signals.push({
      key: 'host-changed',
      label: `Final host changes to ${final.hostname}.`,
      severity: 'medium'
    });
  }

  const safeBrowsingMatches = await checkSafeBrowsing(final.toString(), env);
  if (safeBrowsingMatches.length > 0) {
    signals.push({
      key: 'safe-browsing-threat',
      label: `Google Safe Browsing reported ${safeBrowsingMatches[0].threatType ?? 'a threat'} for this URL.`,
      severity: 'high'
    });
  } else if (!env.GOOGLE_SAFE_BROWSING_API_KEY) {
    signals.push({
      key: 'safe-browsing-not-configured',
      label: 'Safe Browsing key is not configured, so threat-list lookup was skipped.',
      severity: 'medium'
    });
  } else {
    signals.push({
      key: 'safe-browsing-clear',
      label: 'Google Safe Browsing did not report a threat for the final URL.',
      severity: 'low'
    });
  }

  const riskScore = scoreSignals(signals);

  return {
    inputUrl,
    normalizedUrl: normalized.toString(),
    finalUrl: final.toString(),
    host: final.hostname,
    riskScore,
    riskLevel: riskLevel(riskScore),
    title: metadata.title,
    description: metadata.description,
    redirects: metadata.redirects,
    signals: compactSignals(signals),
    checkedAt: new Date().toISOString()
  };
}

export function scoreSignals(signals: SafetySignal[]): number {
  const score = signals.reduce((total, signal) => {
    if (signal.severity === 'high') {
      return total + 34;
    }
    if (signal.severity === 'medium') {
      return total + 15;
    }
    return total;
  }, 0);

  return Math.max(0, Math.min(100, score));
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 67) {
    return 'high';
  }
  if (score >= 34) {
    return 'medium';
  }
  return 'low';
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') {
    return true;
  }

  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  return false;
}

function addStaticSignals(url: URL, signals: SafetySignal[]) {
  if (url.protocol !== 'https:') {
    signals.push({
      key: 'not-https',
      label: 'The URL does not use HTTPS.',
      severity: 'medium'
    });
  }

  if (url.username || url.password) {
    signals.push({
      key: 'credentials',
      label: 'The URL contains embedded credentials.',
      severity: 'high'
    });
  }

  if (isBlockedHost(url.hostname)) {
    signals.push({
      key: 'private-host',
      label: 'The URL points to a local or private network host.',
      severity: 'high'
    });
  }

  if (url.hostname.includes('xn--')) {
    signals.push({
      key: 'punycode',
      label: 'The host uses punycode, which can hide lookalike characters.',
      severity: 'medium'
    });
  }

  if (shortenerHosts.has(url.hostname.replace(/^www\./, ''))) {
    signals.push({
      key: 'shortener',
      label: 'The URL uses a known link shortener.',
      severity: 'medium'
    });
  }

  if (/login|verify|account|wallet|secure|update/i.test(url.hostname + url.pathname)) {
    signals.push({
      key: 'sensitive-words',
      label: 'The URL contains sensitive-account wording.',
      severity: 'medium'
    });
  }
}

async function resolveMetadata(url: URL, signals: SafetySignal[]): Promise<MetadataResult> {
  if (isBlockedHost(url.hostname)) {
    return {
      finalUrl: url.toString(),
      redirects: [],
      fetchBlocked: 'Metadata fetch was skipped because the host is private or local.'
    };
  }

  let current = url;
  const redirects: string[] = [];

  for (let index = 0; index <= maxRedirects; index += 1) {
    const response = await fetchWithTimeout(current.toString()).catch(() => null);
    if (!response) {
      return {
        finalUrl: current.toString(),
        redirects,
        fetchBlocked: 'Metadata fetch failed or timed out.'
      };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        break;
      }

      const next = new URL(location, current);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        signals.push({
          key: 'redirect-protocol',
          label: 'A redirect points to an unsupported protocol.',
          severity: 'high'
        });
        break;
      }
      if (isBlockedHost(next.hostname)) {
        signals.push({
          key: 'redirect-private-host',
          label: 'A redirect points to a local or private network host.',
          severity: 'high'
        });
        break;
      }

      redirects.push(next.toString());
      current = next;
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      return {
        finalUrl: current.toString(),
        redirects,
        fetchBlocked: 'Landing page metadata was skipped because the response is not HTML.'
      };
    }

    const html = await readTextLimited(response, metadataBytes);
    return {
      finalUrl: current.toString(),
      redirects,
      title: extractTitle(html),
      description: extractDescription(html)
    };
  }

  signals.push({
    key: 'redirect-limit',
    label: 'The URL exceeded the redirect limit.',
    severity: 'medium'
  });

  return {
    finalUrl: current.toString(),
    redirects,
    fetchBlocked: 'Redirect resolution stopped after too many hops.'
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    return await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'qr-reliability-checker/1.0'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }
    const remaining = maxBytes - total;
    chunks.push(value.slice(0, remaining));
    total += Math.min(value.byteLength, remaining);
  }

  return new TextDecoder().decode(concatBytes(chunks, total));
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match?.[1]);
}

function extractDescription(html: string): string | undefined {
  const match = html.match(/<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return cleanText(match?.[1]);
}

function cleanText(value: string | undefined): string | undefined {
  const text = value
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 220) : undefined;
}

async function checkSafeBrowsing(url: string, env: AppEnv): Promise<SafeBrowsingMatch[]> {
  if (!env.GOOGLE_SAFE_BROWSING_API_KEY) {
    return [];
  }

  const response = await fetch(
    `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(env.GOOGLE_SAFE_BROWSING_API_KEY)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        client: {
          clientId: 'qr-code-scanner',
          clientVersion: '0.1.0'
        },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }]
        }
      })
    }
  ).catch(() => null);

  if (!response?.ok) {
    return [];
  }

  const payload = (await response.json()) as { matches?: SafeBrowsingMatch[] };
  return payload.matches ?? [];
}

function compactSignals(signals: SafetySignal[]): SafetySignal[] {
  const byKey = new Map<string, SafetySignal>();
  for (const signal of signals) {
    if (!byKey.has(signal.key)) {
      byKey.set(signal.key, signal);
    }
  }
  return Array.from(byKey.values()).slice(0, 12);
}
