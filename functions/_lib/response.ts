export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers
    }
  });
}

export function error(message: string, status = 400) {
  return json({ error: message }, { status });
}

export async function readJsonBody(request: Request, maxBytes = 8192): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > maxBytes) {
    throw new Error('Request body is too large.');
  }

  const text = await request.text();
  if (text.length > maxBytes) {
    throw new Error('Request body is too large.');
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}
