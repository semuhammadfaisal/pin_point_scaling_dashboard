export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function createRequestManager() {
  let controller = null;
  return {
    next() {
      controller?.abort();
      controller = new AbortController();
      return controller.signal;
    },
    abort() {
      controller?.abort();
    },
  };
}

export async function getMetrics(endpoint, parameters = {}, signal) {
  const query = new URLSearchParams();
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') query.set(key, value);
  });
  const response = await fetch(`/api/metrics/${endpoint}?${query.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new ApiError(payload?.error?.message || `Request failed with status ${response.status}.`, response.status, payload);
  }
  return payload;
}
