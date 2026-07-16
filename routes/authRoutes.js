const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const { requireAuth, redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAuthenticated, authController.showLogin);
router.post(
  '/login',
  redirectIfAuthenticated,
  loginRateLimiter,
  body('email').trim().isEmail().normalizeEmail().withMessage('Enter a valid email address.'),
  body('password').isString().isLength({ min: 1, max: 128 }).withMessage('Enter a valid password.'),
  asyncHandler(authController.login)
);
router.post('/logout', requireAuth, asyncHandler(authController.logout));

module.exports = router;
