const SENSITIVE_PATTERN = /authorization|cookie|password|secret|token|api[_-]?(?:key|uid)|hot[_-]?prospector/i;

function sanitize(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code, status: value.statusCode || value.response?.status };
  }
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_PATTERN.test(key) ? '[REDACTED]' : sanitize(entry, seen),
  ]));
}

function write(level, event, details = {}) {
  const record = sanitize({ timestamp: new Date().toISOString(), level, event, ...details });
  const output = JSON.stringify(record);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.info(output);
}

module.exports = {
  info: (event, details) => write('info', event, details),
  warn: (event, details) => write('warn', event, details),
  error: (event, details) => write('error', event, details),
  sanitize,
};
