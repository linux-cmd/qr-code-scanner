import { readJsonBody, error, json } from '../_lib/response';
import type { AppEnv } from '../_lib/types';
import { envFlag } from '../_lib/env';

export const onRequestPost: PagesFunction<AppEnv> = async ({ request, env }) => {
  try {
    if (!envFlag(env.DEEP_SCAN_ENABLED, false)) {
      return json({
        status: 'disabled',
        message: 'Deep scan is disabled. The instant deterministic result is still available.'
      });
    }

    const body = await readJsonBody(request, 4096);
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
      return error('Request body must include a URL string.');
    }

    return json({
      status: 'unavailable',
      message: 'Deep scan provider support is not enabled yet. Enable one provider at a time after terms verification.',
      checkedAt: new Date().toISOString()
    });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : 'Deep scan failed.', 400);
  }
};
