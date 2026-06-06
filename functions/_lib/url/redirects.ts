import type { RedirectHop } from '../types';
import { isBlockedHost } from '../security/ssrf';

export type RedirectResolution = {
  finalUrl: string;
  redirectChain: RedirectHop[];
  title?: string;
  description?: string;
  limitations: string[];
};

const maxRedirects = 5;
const fetchTimeoutMs = 6500;
const metadataBytes = 64 * 1024;

export async function resolveRedirects(startUrl: URL): Promise<RedirectResolution> {
  const limitations: string[] = [];
  const redirectChain: RedirectHop[] = [];
  let current = new URL(startUrl.toString());

  if (isBlockedHost(current.hostname)) {
    return {
      finalUrl: current.toString(),
      redirectChain,
      limitations: ['Redirect resolution was blocked because the URL points to a local or private host.']
    };
  }

  for (let index = 0; index <= maxRedirects; index += 1) {
    const response = await fetchHop(current, 'HEAD').catch(() => null);
    const usableResponse = response && response.status !== 405 ? response : await fetchHop(current, 'GET').catch(() => null);
    if (!usableResponse) {
      limitations.push('Redirect or metadata request failed or timed out.');
      break;
    }

    redirectChain.push({
      url: current.toString(),
      status: usableResponse.status,
      method: response && response.status !== 405 ? 'HEAD' : 'GET',
      hostname: current.hostname,
      protocol: current.protocol
    });

    if (usableResponse.status >= 300 && usableResponse.status < 400) {
      const location = usableResponse.headers.get('location');
      if (!location) {
        break;
      }

      const next = new URL(location, current);
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        limitations.push('A redirect pointed to an unsupported protocol.');
        break;
      }
      if (isBlockedHost(next.hostname)) {
        limitations.push('A redirect pointed to a local or private host and was blocked.');
        break;
      }

      current = next;
      continue;
    }

    const metadata = usableResponse.status === 405 ? null : await readMetadataIfHtml(usableResponse);
    return {
      finalUrl: current.toString(),
      redirectChain,
      title: metadata?.title,
      description: metadata?.description,
      limitations
    };
  }

  if (redirectChain.length > maxRedirects) {
    limitations.push('Redirect resolution stopped after too many hops.');
  }

  return {
    finalUrl: current.toString(),
    redirectChain,
    limitations
  };
}

async function fetchHop(url: URL, method: 'HEAD' | 'GET'): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    return await fetch(url.toString(), {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        range: method === 'GET' ? `bytes=0-${metadataBytes - 1}` : '',
        'user-agent': 'qr-url-intelligence/1.0'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readMetadataIfHtml(response: Response): Promise<{ title?: string; description?: string } | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    return null;
  }
  const html = await readTextLimited(response, metadataBytes);
  return {
    title: cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    description: cleanText(html.match(/<meta\s+[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1])
  };
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
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
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
