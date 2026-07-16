const { rateLimit } = require('express-rate-limit');
const env = require('../config/env');

module.exports = rateLimit({
  windowMs: env.security.apiWindowMs,
  limit: env.security.apiMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(_req, res) {
    return res.status(429).json({
      success: false, filters: {}, summary: {}, data: [],
      error: { code: 'RATE_LIMITED', message: 'Too many API requests. Please wait and try again.' },
      generatedAt: new Date().toISOString(),
    });
  },
});
