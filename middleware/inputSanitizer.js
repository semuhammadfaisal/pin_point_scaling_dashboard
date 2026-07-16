const xss = require('xss');

const SKIP_KEYS = new Set(['password', '_csrf']);

function clean(value, key = '') {
  if (SKIP_KEYS.has(key)) return value;
  if (Array.isArray(value)) return value.map((entry) => clean(entry, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, clean(entry, entryKey)]));
  }
  return typeof value === 'string' ? xss(value, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script'] }).trim() : value;
}

module.exports = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  if (req.params && typeof req.params === 'object') req.params = clean(req.params);
  return next();
};
