import { describe, expect, it } from 'vitest';
import { isBlockedHost, normalizeUrl, riskLevel, scoreSignals } from './safety';

describe('URL safety helpers', () => {
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
});
