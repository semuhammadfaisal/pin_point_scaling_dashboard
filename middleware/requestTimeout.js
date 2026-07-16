module.exports = (milliseconds) => (req, res, next) => {
  res.locals.requestTimedOut = false;
  const timer = setTimeout(() => {
    if (res.headersSent || res.writableEnded) return;
    res.locals.requestTimedOut = true;
    const message = 'The request took too long to complete.';
    if (req.path.startsWith('/api/')) {
      res.status(503).json({
        success: false,
        filters: req.metricsFilters || req.query || {},
        summary: {},
        data: [],
        generatedAt: new Date().toISOString(),
        error: { code: 'REQUEST_TIMEOUT', message, details: [] },
      });
    } else {
      res.status(503).send(message);
    }
  }, milliseconds);
  timer.unref();
  const clear = () => clearTimeout(timer);
  res.once('finish', clear);
  res.once('close', clear);
  next();
};
