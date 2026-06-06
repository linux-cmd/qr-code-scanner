import type { RedirectHop, SafetySignal } from '../types';
import type { NormalizedUrl } from '../url/normalize';
import { isBlockedHost, isIpAddressHost } from '../security/ssrf';

const shortenerHosts = new Set([
  'bit.ly',
  'buff.ly',
  'cutt.ly',
  'goo.gl',
  'is.gd',
  'ow.ly',
  'rebrand.ly',
  'shorturl.at',
  't.co',
  'tinyurl.com'
]);

const suspiciousTlds = new Set(['zip', 'mov', 'top', 'xyz', 'click', 'country', 'stream', 'gq', 'tk']);
const suspiciousExtensions = /\.(apk|bat|cmd|exe|jar|js|msi|scr|vbs|wsf)(?:$|[?#])/i;
const brandWords = ['paypal', 'apple', 'microsoft', 'google', 'amazon', 'facebook', 'instagram', 'netflix', 'bank', 'chase', 'wellsfargo'];
const credentialTerms = /password|credential|signin|sign-in|verify|wallet|seed|recovery|2fa|mfa/i;
const loginPaymentTerms = /login|account|payment|billing|invoice|secure|security|update/i;
const urgentTerms = /urgent|immediate|suspend|locked|expire|final|verify-now|act-now/i;

export function analyzeHeuristics(args: {
  original: NormalizedUrl;
  final: NormalizedUrl;
  redirectChain: RedirectHop[];
  limitations: string[];
}): SafetySignal[] {
  const { original, final, redirectChain } = args;
  const signals: SafetySignal[] = [];
  const finalUrl = final.url;
  const hostname = final.hostname;
  const hostnameParts = hostname.split('.');
  const combinedText = `${hostname} ${final.path} ${final.query}`;

  add(signals, finalUrl.protocol === 'http:', 'httpNotHttps', 'The final URL does not use HTTPS.', 15, 'transport');
  add(
    signals,
    original.url.protocol === 'https:' && finalUrl.protocol === 'http:',
    'httpsToHttpDowngrade',
    'A redirect downgrades from HTTPS to HTTP.',
    30,
    'redirect'
  );
  add(signals, isIpAddressHost(hostname), 'ipAddressHost', 'The destination uses an IP address instead of a domain name.', 35, 'host');
  add(signals, isBlockedHost(hostname), 'localhostOrPrivateIp', 'The destination is local, private, or internal and was blocked from external checks.', 95, 'host');
  add(signals, hostname.includes('xn--'), 'punycodeHostname', 'The hostname uses punycode, which can hide lookalike characters.', 25, 'host');
  add(signals, /[^\x20-\x7E]/.test(hostname), 'suspiciousUnicode', 'The hostname contains non-ASCII characters.', 20, 'host');
  add(signals, hasMixedScripts(hostname), 'mixedScriptHostname', 'The hostname appears to mix character scripts.', 35, 'host');
  add(signals, hostnameParts.length > 4, 'excessiveSubdomains', 'The hostname has many subdomains.', 15, 'host');
  add(signals, hostname.length > 55, 'longHostname', 'The hostname is unusually long.', 10, 'host');
  add(signals, final.normalizedUrl.length > 180, 'longUrl', 'The full URL is unusually long.', 10, 'content');
  add(signals, shortenerHosts.has(hostname.replace(/^www\./, '')), 'urlShortenerDomain', 'The URL uses a known link shortener.', 20, 'host');
  add(signals, suspiciousTlds.has(hostnameParts.at(-1) ?? ''), 'suspiciousTld', 'The top-level domain is often abused in suspicious links.', 15, 'host');
  add(signals, finalUrl.username !== '' || finalUrl.password !== '', 'containsAtSymbol', 'The URL contains embedded credentials or an @-style authority section.', 25, 'content');
  add(signals, Boolean(finalUrl.port && !['80', '443'].includes(finalUrl.port)), 'unusualPort', 'The URL uses an unusual port.', 15, 'host');
  add(signals, loginPaymentTerms.test(combinedText), 'loginPaymentSecurityKeywords', 'The URL contains login, payment, account, or security wording.', 15, 'content');
  add(signals, credentialTerms.test(combinedText), 'credentialCollectionTerms', 'The URL contains credential-collection wording.', 25, 'content');
  add(signals, urgentTerms.test(combinedText), 'urgentActionWords', 'The URL uses urgent action wording.', 10, 'content');
  add(signals, /%[0-9a-f]{2}/i.test(final.path + final.query), 'encodedOrObfuscatedPath', 'The path or query contains encoded or obfuscated text.', 15, 'content');
  add(signals, Array.from(finalUrl.searchParams.keys()).length > 8, 'manyQueryParams', 'The URL contains many query parameters.', 10, 'content');
  add(signals, suspiciousExtensions.test(final.path), 'suspiciousFileExtension', 'The URL points to a file type commonly abused for malware.', 25, 'content');
  const redirectedHosts = redirectChain.slice(1).map((hop) => hop.hostname);
  const crossRegistrableDomain = redirectedHosts.some((hostname) => hostname && !sameRegistrableDomain(hostname, original.registrableDomain));
  add(signals, redirectChain.length > 3, 'redirectChainLong', 'The URL redirects through several hops.', 10, 'redirect');
  add(signals, crossRegistrableDomain, 'crossDomainRedirect', 'The redirect chain changes destination domain.', 15, 'redirect');
  add(
    signals,
    brandWords.some((brand) => hostname.includes(brand)) && !brandWords.some((brand) => final.registrableDomain === `${brand}.com`),
    'brandImpersonationKeyword',
    'The hostname contains a well-known brand or finance keyword outside its official-looking domain.',
    30,
    'host'
  );

  if (signals.length === 0) {
    signals.push({
      key: 'noObviousHeuristicRisk',
      label: 'No obvious risk detected from local URL checks.',
      severity: 'low',
      score: 0,
      category: 'metadata'
    });
  }

  return signals;
}

function add(
  signals: SafetySignal[],
  condition: boolean,
  key: string,
  label: string,
  score: number,
  category: SafetySignal['category']
) {
  if (!condition) {
    return;
  }
  signals.push({
    key,
    label,
    score,
    severity: score >= 80 ? 'dangerous' : score >= 51 ? 'high' : score >= 21 ? 'caution' : 'low',
    category
  });
}

function hasMixedScripts(hostname: string): boolean {
  const hasLatin = /[a-z]/i.test(hostname);
  const hasCyrillic = /[\u0400-\u04FF]/.test(hostname);
  const hasGreek = /[\u0370-\u03FF]/.test(hostname);
  return hasLatin && (hasCyrillic || hasGreek);
}

function sameRegistrableDomain(hostname: string, registrableDomain: string): boolean {
  return hostname === registrableDomain || hostname.endsWith(`.${registrableDomain}`);
}
