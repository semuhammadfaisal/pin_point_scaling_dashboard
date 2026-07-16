const path = require('path');
const dotenv = require('dotenv');
const { passwordErrors } = require('../utils/passwordPolicy');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const requiredVariables = [
  'MONGODB_URI',
  'SESSION_SECRET',
  'ADMIN_NAME',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'HOT_PROSPECTOR_API_UID',
  'HOT_PROSPECTOR_API_KEY',
];

function validateEnvironment() {
  const missing = requiredVariables.filter((key) => !process.env[key]?.trim());

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const allowedEnvironments = ['development', 'test', 'production'];
  if (!allowedEnvironments.includes(process.env.NODE_ENV || 'development')) {
    throw new Error(`NODE_ENV must be one of: ${allowedEnvironments.join(', ')}.`);
  }

  const positiveNumbers = [
    'HOT_PROSPECTOR_TIMEOUT_MS', 'HOT_PROSPECTOR_RETRIES', 'LOGIN_RATE_LIMIT_WINDOW_MS',
    'LOGIN_RATE_LIMIT_MAX', 'API_RATE_LIMIT_WINDOW_MS', 'API_RATE_LIMIT_MAX', 'REQUEST_TIMEOUT_MS',
    'CRON_LOCK_TTL_MS', 'MONGODB_MAX_POOL_SIZE', 'MONGODB_MIN_POOL_SIZE', 'METRICS_CACHE_TTL_MS',
  ];
  positiveNumbers.forEach((key) => {
    if (process.env[key] !== undefined && (!Number.isFinite(Number(process.env[key])) || Number(process.env[key]) < 0)) {
      throw new Error(`${key} must be a non-negative number.`);
    }
  });

  for (const key of ['METRICS_MAX_RANGE_DAYS', 'METRICS_DEFAULT_RANGE_DAYS']) {
    if (process.env[key] !== undefined && (!Number.isInteger(Number(process.env[key])) || Number(process.env[key]) < 1)) {
      throw new Error(`${key} must be a positive integer.`);
    }
  }
  if (Number(process.env.METRICS_DEFAULT_RANGE_DAYS || 30) > Number(process.env.METRICS_MAX_RANGE_DAYS || 366)) {
    throw new Error('METRICS_DEFAULT_RANGE_DAYS cannot exceed METRICS_MAX_RANGE_DAYS.');
  }

  if ((process.env.NODE_ENV || 'development') === 'production') {
    const errors = passwordErrors(process.env.ADMIN_PASSWORD);
    if (errors.length) throw new Error(`ADMIN_PASSWORD ${errors.join(', ')}.`);
  }
}

validateEnvironment();

module.exports = Object.freeze({
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  mongodbUri: process.env.NODE_ENV === 'test' && process.env.TEST_MONGODB_URI
    ? process.env.TEST_MONGODB_URI
    : process.env.MONGODB_URI,
  sessionSecret: process.env.SESSION_SECRET,
  admin: {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
  hotProspector: {
    uid: process.env.HOT_PROSPECTOR_API_UID,
    apiKey: process.env.HOT_PROSPECTOR_API_KEY,
    baseUrl: process.env.HOT_PROSPECTOR_BASE_URL || 'https://service.hookscall.com/glu/api/v2',
    timeoutMs: Number(process.env.HOT_PROSPECTOR_TIMEOUT_MS || 15000),
    retries: Number(process.env.HOT_PROSPECTOR_RETRIES || 3),
    webCookie: String(process.env.HOT_PROSPECTOR_WEB_COOKIE || '').trim(),
  },
  cron: {
    enabled: process.env.SYNC_CRON_ENABLED !== 'false',
    recent: process.env.SYNC_CRON_RECENT || '*/5 * * * *',
    metrics: process.env.SYNC_CRON_METRICS || '0 * * * *',
    nightly: process.env.SYNC_CRON_NIGHTLY || '15 2 * * *',
    recalculate: process.env.SYNC_CRON_RECALCULATE || '45 2 * * *',
    timezone: process.env.SYNC_CRON_TIMEZONE || 'UTC',
  },
  metrics: {
    maxRangeDays: Number(process.env.METRICS_MAX_RANGE_DAYS || 366),
    defaultRangeDays: Number(process.env.METRICS_DEFAULT_RANGE_DAYS || 30),
    validBookingStatuses: String(process.env.METRICS_VALID_BOOKING_STATUSES || 'booked,confirmed,scheduled')
      .split(',').map((status) => status.trim().toLowerCase()).filter(Boolean),
    excludedBookingStatuses: String(process.env.METRICS_EXCLUDED_BOOKING_STATUSES || 'cancelled,deleted,no-show')
      .split(',').map((status) => status.trim().toLowerCase()).filter(Boolean),
    dailyCron: process.env.METRICS_CRON_DAILY || '10 3 * * *',
    cacheTtlMs: Number(process.env.METRICS_CACHE_TTL_MS || 30000),
  },
  security: {
    loginWindowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 900000),
    loginMax: Number(process.env.LOGIN_RATE_LIMIT_MAX || 5),
    apiWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60000),
    apiMax: Number(process.env.API_RATE_LIMIT_MAX || 120),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 120000),
  },
  cronLockTtlMs: Number(process.env.CRON_LOCK_TTL_MS || 2 * 60 * 60 * 1000),
});
