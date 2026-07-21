const express = require('express');
const controller = require('../controllers/dataQualityController');
const asyncHandler = require('../utils/asyncHandler');
const { errorResponse } = require('../utils/metricsResponse');

const router = express.Router();

router.use('/api/admin/data-quality', (req, res, next) => {
  if (req.session?.admin) return next();
  return res.status(401).json(errorResponse(req.query, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'));
});
router.get('/api/admin/data-quality/status', asyncHandler(controller.status));
router.get('/api/admin/data-quality/mappings', asyncHandler(controller.mappingStatus));

module.exports = router;
