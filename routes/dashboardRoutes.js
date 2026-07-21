const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const pageController = require('../controllers/pageController');
const settingsController = require('../controllers/settingsController');
const dataQualityController = require('../controllers/dataQualityController');
const asyncHandler = require('../utils/asyncHandler');
const { body, param } = require('express-validator');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const protectedPrefixes = ['/dashboard', '/clinics', '/csr-performance', '/booking-ratios', '/settings'];
router.use((req, res, next) => {
  const protectedRoute = protectedPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
  return protectedRoute ? requireAuth(req, res, next) : next();
});
router.get('/', (_req, res) => res.redirect('/dashboard'));
router.get('/dashboard', asyncHandler(dashboardController.showDashboard));
router.get('/clinics', asyncHandler(pageController.showClinics));
router.get('/clinics/:clinicId', param('clinicId').isMongoId().withMessage('Invalid clinic ID.'), asyncHandler(pageController.showClinicDetails));
router.get('/csr-performance', asyncHandler(pageController.showCsrPerformance));
router.get('/booking-ratios', asyncHandler(pageController.showBookingRatios));
router.get('/settings', asyncHandler(settingsController.showSettings));
router.get('/settings/integrations', asyncHandler(settingsController.showIntegrations));
router.post('/settings/integrations/test', asyncHandler(settingsController.testIntegration));
router.get('/settings/clinics', asyncHandler(settingsController.showClinics));
router.post(
  '/settings/clinics',
  body('name').trim().isLength({ min: 2, max: 150 }).withMessage('Clinic name must contain 2 to 150 characters.'),
  body('slug').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Slug is too long.'),
  body('timezone').trim().notEmpty().withMessage('Timezone is required.'),
  body('hotProspectorCampaignId').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Campaign ID is too long.'),
  body('hotProspectorGroupId').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Group ID is too long.'),
  body('active').optional().isIn(['true', 'false']).withMessage('Invalid active status.'),
  body('sourceLocationId').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Source location ID is too long.'),
  body('locationAliases').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Location aliases are too long.'),
  body('timezoneVerified').optional().isIn(['true', 'false']).withMessage('Invalid timezone verification.'),
  body('mappingVerified').optional().isIn(['true', 'false']).withMessage('Invalid mapping verification.'),
  asyncHandler(settingsController.createClinic)
);
router.post(
  '/settings/clinics/:id',
  param('id').isMongoId().withMessage('Invalid clinic ID.'),
  body('name').trim().isLength({ min: 2, max: 150 }).withMessage('Clinic name must contain 2 to 150 characters.'),
  body('slug').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Slug is too long.'),
  body('timezone').trim().notEmpty().withMessage('Timezone is required.'),
  body('hotProspectorCampaignId').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Campaign ID is too long.'),
  body('hotProspectorGroupId').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Group ID is too long.'),
  body('active').optional().isIn(['true', 'false']).withMessage('Invalid active status.'),
  body('sourceLocationId').optional({ checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Source location ID is too long.'),
  body('locationAliases').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Location aliases are too long.'),
  body('timezoneVerified').optional().isIn(['true', 'false']).withMessage('Invalid timezone verification.'),
  body('mappingVerified').optional().isIn(['true', 'false']).withMessage('Invalid mapping verification.'),
  asyncHandler(settingsController.updateClinic)
);
router.post(
  '/settings/sync',
  body('syncType').isIn(['recent', 'metrics', 'sevenDays', 'recalculate']).withMessage('Invalid sync type.'),
  asyncHandler(settingsController.triggerSync)
);
router.get('/settings/sync-logs', asyncHandler(settingsController.showSyncLogs));
router.get('/settings/data-quality', asyncHandler(dataQualityController.show));
router.post('/settings/data-quality/backfill', asyncHandler(dataQualityController.startBackfill));
router.post('/settings/data-quality/reconcile', asyncHandler(dataQualityController.startReconciliation));

module.exports = router;
