const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoose = require('mongoose');
const crypto = require('crypto');
const mongoSanitize = require('express-mongo-sanitize');

const env = require('./config/env');
const connectDatabase = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const reportRoutes = require('./routes/reportRoutes');
const dataQualityRoutes = require('./routes/dataQualityRoutes');
const csrfProtection = require('./middleware/csrf');
const inputSanitizer = require('./middleware/inputSanitizer');
const requestTimeout = require('./middleware/requestTimeout');
const apiRateLimiter = require('./middleware/apiRateLimiter');
const { exposeFlash } = require('./middleware/flash');
const locals = require('./middleware/locals');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const metricsErrorHandler = require('./middleware/metricsErrorHandler');
const { startJobs, stopJobs } = require('./jobs');
const systemController = require('./controllers/systemController');
const runtimeState = require('./utils/runtimeState');
const logger = require('./utils/logger');
const v2CutoverService = require('./services/v2CutoverService');

const app = express();

app.disable('x-powered-by');
if (env.isProduction) app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');
app.use(expressLayouts);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: env.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: env.isProduction ? [] : null,
      },
    },
  })
);
app.use(compression());
app.use((req, res, next) => {
  req.id = String(req.get('x-request-id') || crypto.randomUUID()).slice(0, 100);
  res.set('X-Request-ID', req.id);
  next();
});
app.use(morgan((tokens, req, res) => JSON.stringify({
  timestamp: new Date().toISOString(), level: 'info', event: 'http_request', requestId: req.id,
  method: tokens.method(req, res), path: tokens.url(req, res), status: Number(tokens.status(req, res)),
  responseTimeMs: Number(tokens['response-time'](req, res)), contentLength: tokens.res(req, res, 'content-length') || null,
})));
app.get('/health', systemController.health);
app.get('/ready', systemController.ready);
app.use(requestTimeout(env.security.requestTimeoutMs));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(inputSanitizer);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: env.isProduction ? '7d' : 0 }));
app.use('/brand-assets', express.static(path.join(__dirname, 'assets', 'images'), { maxAge: env.isProduction ? '30d' : 0 }));
app.get('/favicon.ico', (_req, res) => res.redirect(301, '/favicon.svg'));

app.use(
  session({
    name: 'clinic.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    store: MongoStore.create({
      mongoUrl: env.mongodbUri,
      collectionName: 'sessions',
      ttl: 8 * 60 * 60,
      autoRemove: 'native',
      disableTouch: true,
    }),
    cookie: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.use(locals);
app.use(exposeFlash);
app.use(csrfProtection);
app.use('/api', apiRateLimiter);
app.use(authRoutes);
app.use(metricsRoutes);
app.use(dataQualityRoutes);
app.use(reportRoutes);
app.use(dashboardRoutes);
app.use(metricsErrorHandler);
app.use(notFound);
app.use(errorHandler);

let server;

async function startServer() {
  await connectDatabase();
  if (env.metrics.dataVersion === 'v2') await v2CutoverService.assertReady();
  startJobs();
  server = app.listen(env.port, () => {
    logger.info('server_started', { port: env.port, environment: env.nodeEnv });
  });
  server.on('error', (error) => logger.error('server_error', { error }));
  return server;
}

async function shutdown(signal, exitCode = 0) {
  if (runtimeState.isShuttingDown()) return;
  runtimeState.beginShutdown();
  logger.info('shutdown_started', { signal });
  stopJobs();
  const forceTimer = setTimeout(() => {
    logger.error('shutdown_forced', { signal });
    process.exit(1);
  }, 10000);
  forceTimer.unref();
  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    clearTimeout(forceTimer);
    logger.info('shutdown_completed', { signal });
    process.exit(exitCode);
  } catch (error) {
    logger.error('shutdown_failed', { signal, error });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (error) => {
  logger.error('unhandled_rejection', { error });
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', { error });
  shutdown('uncaughtException', 1);
});

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('server_start_failed', { error });
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;
module.exports.shutdown = shutdown;
