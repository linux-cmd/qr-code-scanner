export function isIpAddressHost(hostname: string): boolean {
  return isIpv4(hostname) || hostname === '::1' || hostname.startsWith('[');
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  if (host === '0.0.0.0' || host === '::1' || host === '::' || host === '169.254.169.254') {
    return true;
  }

  if (!isIpv4(host)) {
    return false;
  }

  const [a, b] = host.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}
