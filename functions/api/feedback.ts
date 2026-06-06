import { readJsonBody, error, json } from '../_lib/response';
import type { AppEnv } from '../_lib/types';

export const onRequestPost: PagesFunction<AppEnv> = async ({ request }) => {
  try {
    const body = await readJsonBody(request, 4096);
    if (!body || typeof body !== 'object') {
      return error('Feedback body must be an object.');
    }

    return json({
      status: 'received',
      message: 'Thanks. Feedback storage is not configured yet, so this acknowledgement is non-persistent.',
      checkedAt: new Date().toISOString()
    });
  } catch (caught) {
    return error(caught instanceof Error ? caught.message : 'Feedback failed.', 400);
  }
};
