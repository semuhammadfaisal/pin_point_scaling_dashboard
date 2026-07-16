const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

function keyGenerator(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${ipKeyGenerator(req.ip)}:${email}`;
}

const loginRateLimiter = rateLimit({
  windowMs: env.security.loginWindowMs,
  limit: env.security.loginMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator,
  skipSuccessfulRequests: true,
  handler(req, res) {
    return res.status(429).render('auth/login', {
      layout: 'layouts/auth',
      title: 'Sign in',
      formData: { email: req.body?.email || '' },
      errors: [{ msg: 'Too many sign-in attempts. Please wait and try again.' }],
    });
  },
});

loginRateLimiter.reset = () => {};
loginRateLimiter.clearExpired = () => {};

module.exports = loginRateLimiter;
