import type { AppEnv } from './types';
import { envFlag } from './env';

export async function hashText(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function enforceRateLimit(args: {
  env: AppEnv;
  request: Request;
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}) {
  if (!envFlag(args.env.RATE_LIMIT_ENABLED, true)) {
    return;
  }

  const kv = args.env.RATE_LIMIT_KV;
  if (!kv) {
    return;
  }

  const ip = args.request.headers.get('cf-connecting-ip') ?? args.request.headers.get('x-forwarded-for') ?? 'unknown';
  const windowId = Math.floor(Date.now() / (args.windowSeconds * 1000));
  const hashedIdentifier = await hashText(args.identifier);
  const key = `rl:${args.scope}:${ip}:${hashedIdentifier}:${windowId}`;
  const current = Number((await kv.get(key)) ?? '0');

  if (current >= args.limit) {
    throw new Error('Rate limit reached. Please wait a little before trying again.');
  }

  await kv.put(key, String(current + 1), { expirationTtl: args.windowSeconds + 30 });
}
