const SENSITIVE_KEY = /authorization|cookie|password|secret|token|api[_-]?(?:key|uid)/i;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(entry),
    ])
  );
}

function logApiError(error, context = {}) {
  const safeError = error || new Error('Unknown Hot Prospector API error.');
  const record = {
    timestamp: new Date().toISOString(),
    level: 'error',
    event: 'hot_prospector_api_error',
    context: redact(context),
    error: {
      name: safeError.name,
      message: safeError.message,
      code: safeError.code,
      status: safeError.response?.status,
      response: redact(safeError.response?.data),
    },
  };
  console.error(JSON.stringify(record));
}

module.exports = { logApiError, redact };
