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
      { key: 'a', label: 'caution signal', severity: 'caution', score: 15, category: 'metadata' },
      { key: 'b', label: 'high signal', severity: 'high', score: 34, category: 'metadata' },
      { key: 'c', label: 'low signal', severity: 'low', score: 0, category: 'metadata' }
    ]);

    expect(score).toBe(49);
    expect(riskLevel(score)).toBe('caution');
  });

  it('scores strong deterministic signals without a feed dependency', () => {
    expect(scoreSignals([{ key: 'localhostOrPrivateIp', label: 'Private URL.', severity: 'dangerous', score: 95, category: 'host' }])).toBe(95);
    expect(scoreSignals([{ key: 'mixedScriptHostname', label: 'Mixed scripts.', severity: 'caution', score: 35, category: 'host' }])).toBe(35);
  });

  it('runs without optional threat feed keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('<title>Example</title>', {
          headers: { 'content-type': 'text/html' }
        });
      })
    );

    const result = await buildUrlCheck('https://example.com', { THREAT_FEEDS_ENABLED: 'false' });

    expect(result.summaryLabel).toBe('No obvious risk detected');
    expect(result.threatIntel[0].commercialUseStatus).toBe('disabled');
    expect(result.threatIntel[0].rawReference).toContain('External threat feeds disabled');
    expect(result.confidenceWording).toBe('Confidence: low because external threat feeds are disabled. No obvious risk was found in local URL and redirect checks.');
  });

  it('keeps same-domain redirects low risk by themselves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const nextUrl = String(url);
        if (nextUrl.includes('/start')) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://www.pret.co.uk/en-GB/club-pret?utm_source=QR' }
          });
        }
        return new Response('<title>Club Pret</title>', {
          headers: { 'content-type': 'text/html' }
        });
      })
    );

    const result = await buildUrlCheck('https://www.pret.co.uk/start?utm_source=QR', { THREAT_FEEDS_ENABLED: 'false' });

    expect(result.finalUrl).toBe('https://www.pret.co.uk/en-GB/club-pret?utm_source=QR');
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe('low');
    expect(result.signals.some((signal) => signal.key === 'crossDomainRedirect')).toBe(false);
  });

  it('adds risk for cross-domain redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const nextUrl = String(url);
        if (nextUrl.includes('example.com/start')) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://other-example.net/final' }
          });
        }
        return new Response('<title>Other</title>', {
          headers: { 'content-type': 'text/html' }
        });
      })
    );

    const result = await buildUrlCheck('https://example.com/start', { THREAT_FEEDS_ENABLED: 'false' });

    expect(result.signals.some((signal) => signal.key === 'crossDomainRedirect')).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(15);
  });

  it('falls back to deterministic heuristics when optional feeds are unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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

    const result = await buildUrlCheck('https://example.com', { THREAT_FEEDS_ENABLED: 'true', GOOGLE_WEB_RISK_ENABLED: 'true', GOOGLE_WEB_RISK_API_KEY: 'test-key' });

    expect(result.threatIntel.some((item) => item.source === 'google-web-risk' && item.status === 'unavailable')).toBe(true);
    expect(result.riskScore).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Google Web Risk lookup failed'));
  });

  it('keeps suspicious PayPal-looking URLs high risk', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<title>Suspicious</title>', { headers: { 'content-type': 'text/html' } }))
    );

    const result = await buildUrlCheck('https://paypal-security.example.com/login?x=%2F%2F', { THREAT_FEEDS_ENABLED: 'false' });

    expect(result.riskLevel).toBe('high');
    expect(result.riskScore).toBeGreaterThanOrEqual(51);
  });

  it('marks private or local IP URLs dangerous without external threat feeds', async () => {
    const result = await buildUrlCheck('http://192.168.0.1', { THREAT_FEEDS_ENABLED: 'false' });

    expect(result.riskLevel).toBe('dangerous');
    expect(result.riskScore).toBeGreaterThanOrEqual(95);
  });
});
