export class ApiError extends Error {
  constructor(message, status, payload = {}) {
    super(message);
    this.status = status;
    Object.assign(this, payload);
  }
}

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('No se pudo conectar con la demo. Comprueba tu conexión e intenta nuevamente.', 0);
  }
  const payload = await response.json();
  if (!response.ok)
    throw new ApiError(payload.message || 'No se pudo completar la operación.', response.status, payload);
  return payload;
}
