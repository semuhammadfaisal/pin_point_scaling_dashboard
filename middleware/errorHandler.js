const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function notFound(req, _res, next) {
  next(new AppError(`The page ${req.originalUrl} could not be found.`, 404));
}

function errorHandler(error, req, res, _next) {
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (statusCode >= 500) logger.error('request_failed', { requestId: req.id, method: req.method, path: req.originalUrl, error });

  if (res.headersSent) return req.socket.destroy();

  const view = statusCode === 404 ? 'errors/404' : 'errors/error';
  return res.status(statusCode).render(view, {
    layout: 'layouts/auth',
    title: statusCode === 404 ? 'Page not found' : 'Something went wrong',
    statusCode,
    message: error.isOperational || !isProduction ? error.message : 'An unexpected error occurred.',
    stack: !isProduction ? error.stack : null,
  });
}

module.exports = { notFound, errorHandler };
