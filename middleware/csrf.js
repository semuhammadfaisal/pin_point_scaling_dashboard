const crypto = require('crypto');
const AppError = require('../utils/AppError');

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function safeEqual(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string') return false;
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
}

function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = createToken();
  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const submittedToken = req.body?._csrf || req.get('x-csrf-token');
  if (!safeEqual(submittedToken, req.session.csrfToken)) {
    return next(new AppError('Your form session expired. Refresh the page and try again.', 403));
  }

  req.session.csrfToken = createToken();
  res.locals.csrfToken = req.session.csrfToken;
  return next();
}

module.exports = csrfProtection;
