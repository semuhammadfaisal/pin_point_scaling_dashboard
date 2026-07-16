const { errorResponse } = require('../utils/metricsResponse');

module.exports = (error, req, res, next) => {
  if (!req.path.startsWith('/api/metrics') && !req.path.startsWith('/api/reports')) return next(error);
  if (res.locals.requestTimedOut || res.writableEnded) return undefined;
  const status = error.statusCode || (error.name === 'CastError' ? 400 : 500);
  if (status >= 500) console.error(error);
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Unable to generate reporting data.'
    : error.message;
  return res.status(status).json(errorResponse(req.metricsFilters || req.query, status === 404 ? 'NOT_FOUND' : 'METRICS_ERROR', message));
};
