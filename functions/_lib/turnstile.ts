import type { AppEnv } from './types';

type TurnstileResponse = {
  success: boolean;
  'error-codes'?: string[];
};

export async function verifyTurnstile(env: AppEnv, token: string | null | undefined, request: Request) {
  if (!env.TURNSTILE_SECRET_KEY) {
    return;
  }

  if (!token) {
    throw new Error('Complete the verification challenge before requesting AI analysis.');
  }

  const formData = new FormData();
  formData.set('secret', env.TURNSTILE_SECRET_KEY);
  formData.set('response', token);
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) {
    formData.set('remoteip', ip);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData
  });

  const payload = (await response.json()) as TurnstileResponse;
  if (!payload.success) {
    throw new Error('Verification failed. Refresh the challenge and try again.');
  }
}
