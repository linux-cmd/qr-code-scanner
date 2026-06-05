import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildUrlCheck, isBlockedHost, normalizeUrl, riskLevel, scoreSignals } from './safety';

describe('URL safety helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes web URLs and strips fragments', () => {
    expect(normalizeUrl('Example.com/path#secret').toString()).toBe('https://example.com/path');
  });

  it('blocks local and private network hosts', () => {
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('192.168.1.10')).toBe(true);
    expect(isBlockedHost('10.0.0.1')).toBe(true);
    expect(isBlockedHost('example.com')).toBe(false);
  });

  it('scores deterministic signals without AI input', () => {
    const score = scoreSignals([
      { key: 'a', label: 'medium signal', severity: 'medium' },
      { key: 'b', label: 'high signal', severity: 'high' },
      { key: 'c', label: 'low signal', severity: 'low' }
    ]);

    expect(score).toBe(49);
    expect(riskLevel(score)).toBe('medium');
  });

  it('scores Google Web Risk matches as high confidence risk', () => {
    expect(scoreSignals([{ key: 'web-risk-threat-MALWARE', label: 'Known Google threat match found. MALWARE: dangerous.', severity: 'high' }])).toBe(
      100
    );
    expect(
      scoreSignals([{ key: 'web-risk-threat-SOCIAL_ENGINEERING', label: 'Known Google threat match found. SOCIAL_ENGINEERING: dangerous.', severity: 'high' }])
    ).toBe(100);
    expect(
      scoreSignals([{ key: 'web-risk-threat-UNWANTED_SOFTWARE', label: 'Known Google threat match found. UNWANTED_SOFTWARE: high risk.', severity: 'high' }])
    ).toBe(80);
  });

  it('uses Google Web Risk uris.search and cautious no-match wording', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const nextUrl = String(url);
        if (nextUrl.includes('webrisk.googleapis.com')) {
          expect(nextUrl).toContain('/v1/uris:search');
          expect(nextUrl).toContain('threatTypes=MALWARE');
          expect(nextUrl).toContain('threatTypes=SOCIAL_ENGINEERING');
          expect(nextUrl).toContain('threatTypes=UNWANTED_SOFTWARE');
          expect(nextUrl).toContain('key=test-key');
          return Response.json({});
        }
        return new Response('<title>Example</title>', {
          headers: { 'content-type': 'text/html' }
        });
      })
    );

    const result = await buildUrlCheck('https://example.com', { GOOGLE_WEB_RISK_API_KEY: 'test-key' });

    expect(result.signals).toContainEqual({
      key: 'web-risk-no-match',
      label: 'No known Google threat match found. This does not guarantee the site is safe.',
      severity: 'low'
    });
  });

  it('falls back to deterministic heuristics when Google Web Risk is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const nextUrl = String(url);
        if (nextUrl.includes('webrisk.googleapis.com')) {
          return new Response(null, { status: 503 });
        }
        return new Response('<title>Example</title>', {
          headers: { 'content-type': 'text/html' }
        });
      })
    );

    const result = await buildUrlCheck('https://example.com', { GOOGLE_WEB_RISK_API_KEY: 'test-key' });

    expect(result.signals).toContainEqual({
      key: 'web-risk-unavailable',
      label: 'Google Web Risk lookup is unavailable, so deterministic heuristics were used without Google threat intelligence.',
      severity: 'low'
    });
    expect(result.riskScore).toBe(0);
  });
});
