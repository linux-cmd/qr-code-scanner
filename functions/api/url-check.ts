import { readJsonBody, error, json } from '../_lib/response';
import { buildUrlCheck } from '../_lib/safety';
import type { AppEnv } from '../_lib/types';

export const onRequestPost: PagesFunction<AppEnv> = async ({ request, env }) => {
  try {
    const body = await readJsonBody(request, 4096);
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string') {
      return error('Request body must include a URL string.');
    }

    const result = await buildUrlCheck(body.url, env);
    return json(result);
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : 'URL check failed.', 400);
  }
};
