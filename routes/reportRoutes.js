const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const reportController = require('../controllers/reportController');
const validateMetricsQuery = require('../middleware/metricsValidation');
const validateReport = require('../middleware/reportValidation');
const { requireAuth } = require('../middleware/auth');
const { errorResponse } = require('../utils/metricsResponse');

const router = express.Router();

function requireApiAuth(req, res, next) {
  if (req.session?.admin) return next();
  return res.status(401).json(errorResponse(req.query, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
}

router.get('/api/reports/preview', requireApiAuth, validateMetricsQuery, validateReport, asyncHandler(reportController.preview));
router.get('/reports/export/csv', requireAuth, validateMetricsQuery, validateReport, asyncHandler(reportController.exportCsv));
router.get('/reports/export/xlsx', requireAuth, validateMetricsQuery, validateReport, asyncHandler(reportController.exportXlsx));
router.get('/reports', requireAuth, asyncHandler(reportController.showReports));

module.exports = router;
