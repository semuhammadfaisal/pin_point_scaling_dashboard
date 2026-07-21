const crypto = require('crypto');

const REDACT_KEY = /(cookie|authorization|token|secret|api.?key|password)/i;
const PII_KEY = /(phone|from_number|to_number|email|lead_?name|caller_?name|recording|transcript|message_data)/i;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((result, [key, child]) => {
    if (REDACT_KEY.test(key)) result[key] = '[REDACTED]';
    else if (PII_KEY.test(key)) result[key] = child ? `[HASH:${hash(String(child)).slice(0, 16)}]` : child;
    else result[key] = sanitize(child);
    return result;
  }, {});
}

function requestFingerprint(endpointKey, filters) {
  return hash({ endpointKey, filters: canonicalize(filters || {}) });
}

module.exports = { canonicalize, hash, sanitize, requestFingerprint };
