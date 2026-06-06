import { hashText } from './rateLimit';

export async function versionedHashKey(prefix: string, value: string): Promise<string> {
  return `${prefix}:${await hashText(value)}`;
}

export async function readKvJson<T>(kv: KVNamespace | undefined, key: string): Promise<T | null> {
  if (!kv) {
    return null;
  }
  return (await kv.get(key, 'json')) as T | null;
}

export async function writeKvJson(kv: KVNamespace | undefined, key: string, value: unknown, ttlSeconds: number) {
  if (!kv) {
    return;
  }
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}
