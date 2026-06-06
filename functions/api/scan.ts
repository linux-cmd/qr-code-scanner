import { enforceRateLimit } from '../_lib/rateLimit';
import { readJsonBody, error, json } from '../_lib/response';
import { buildScanResult } from '../_lib/scan';
import type { AppEnv } from '../_lib/types';
import { envFlag } from '../_lib/env';

export const onRequestPost: PagesFunction<AppEnv> = async ({ request, env }) => {
  try {
    const body = await readJsonBody(request, 4096);
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
      return error('Request body must include a URL string.');
    }

    if (envFlag(env.RATE_LIMIT_ENABLED, true)) {
      await enforceRateLimit({
        env,
        request,
        scope: 'scan',
        identifier: body.url,
        limit: 40,
        windowSeconds: 60 * 10
      });
    }

    const result = await buildScanResult(body.url, env);
    return json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Scan failed.';
    const status = message.includes('Rate limit') ? 429 : 400;
    return error(message, status);
  }
};
