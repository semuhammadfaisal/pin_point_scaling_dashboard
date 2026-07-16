const express = require('express');
const metricsController = require('../controllers/metricsController');
const validateMetricsQuery = require('../middleware/metricsValidation');
const asyncHandler = require('../utils/asyncHandler');
const { errorResponse } = require('../utils/metricsResponse');

const router = express.Router();

function requireApiAuth(req, res, next) {
  if (req.session?.admin) return next();
  return res.status(401).json(errorResponse(req.query, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
}

router.use('/api/metrics', requireApiAuth);
router.get('/api/metrics/overview', validateMetricsQuery, asyncHandler(metricsController.overview));
router.get('/api/metrics/trends', validateMetricsQuery, asyncHandler(metricsController.trends));
router.get('/api/metrics/clinics', validateMetricsQuery, asyncHandler(metricsController.clinics));
router.get('/api/metrics/clinics/:clinicId', validateMetricsQuery, asyncHandler(metricsController.clinic));
router.get('/api/metrics/csrs', validateMetricsQuery, asyncHandler(metricsController.csrs));
router.get('/api/metrics/csrs/:csrId', validateMetricsQuery, asyncHandler(metricsController.csr));
router.get('/api/metrics/booking-ratios', validateMetricsQuery, asyncHandler(metricsController.bookingRatios));
router.get('/api/metrics/speed-to-lead', validateMetricsQuery, asyncHandler(metricsController.speedToLead));
router.get('/api/metrics/call-efficiency', validateMetricsQuery, asyncHandler(metricsController.callEfficiency));
router.get('/api/metrics/talk-time', validateMetricsQuery, asyncHandler(metricsController.talkTime));

module.exports = router;
