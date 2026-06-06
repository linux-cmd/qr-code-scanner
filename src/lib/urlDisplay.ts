export function compactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
  } catch {
    return value;
  }
}
