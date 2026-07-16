const { getReportDefinition } = require('../config/reportDefinitions');
const { errorResponse } = require('../utils/metricsResponse');

module.exports = (req, res, next) => {
  const reportType = String(req.query.reportType || 'agency-daily').trim();
  if (!getReportDefinition(reportType)) {
    const payload = errorResponse(req.query, 'VALIDATION_ERROR', 'Unsupported report type.', [
      { field: 'reportType', message: 'Choose one of the supported report types.' },
    ]);
    if (req.path.includes('/export/')) return res.status(400).send(payload.error.message);
    return res.status(400).json(payload);
  }
  req.reportType = reportType;
  return next();
};
