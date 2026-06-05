import { describe, expect, it } from 'vitest';
import { getUrlCandidate, hostnameFromUrl } from './url';

describe('client URL helpers', () => {
  it('adds https to bare hostnames', () => {
    expect(getUrlCandidate('example.com/path')).toBe('https://example.com/path');
  });

  it('rejects non-web payloads', () => {
    expect(getUrlCandidate('mailto:test@example.com')).toBeNull();
    expect(getUrlCandidate('plain text value')).toBeNull();
  });

  it('returns a hostname for display', () => {
    expect(hostnameFromUrl('https://www.example.com/a')).toBe('www.example.com');
  });
});
