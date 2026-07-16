const cron = require('node-cron');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const env = require('../config/env');
const syncService = require('../services/hotProspectorSyncService');
const metricsService = require('../services/metricsService');
const lockService = require('../services/jobLockService');
const logger = require('../utils/logger');

let scheduledJobs = [];

async function runSafely(name, handler) {
  const acquired = await lockService.acquire('cron:global', env.cronLockTtlMs);
  if (!acquired) {
    logger.info('cron_skipped', { job: name, reason: 'distributed_lock_held' });
    return;
  }
  const startedAt = Date.now();
  try {
    await handler();
    logger.info('cron_completed', { job: name, durationMs: Date.now() - startedAt });
  } catch (error) {
    logger.error('cron_failed', { job: name, durationMs: Date.now() - startedAt, error });
  } finally {
    await lockService.release('cron:global').catch((error) => logger.error('cron_lock_release_failed', { job: name, error }));
  }
}

function schedule(expression, name, handler) {
  if (!cron.validate(expression)) throw new Error(`Invalid cron expression for ${name}: ${expression}`);
  return cron.schedule(expression, () => runSafely(name, handler), { timezone: env.cron.timezone });
}

function startJobs() {
  const cleanupJob = cron.schedule('*/15 * * * *', () => {
    loginRateLimiter.clearExpired();
  });

  if (!env.cron.enabled) {
    logger.info('sync_cron_disabled');
    scheduledJobs = [cleanupJob];
    return scheduledJobs;
  }

  scheduledJobs = [
    cleanupJob,
    schedule(env.cron.recent, 'sync_recent', syncService.syncRecent),
    schedule(env.cron.metrics, 'sync_agent_metrics', () => syncService.syncAgentMetrics()),
    schedule(env.cron.nightly, 'sync_previous_7_days', syncService.syncPreviousSevenDays),
    schedule(env.cron.recalculate, 'recalculate_metrics', () => syncService.recalculateDailyMetrics(7)),
    schedule(env.metrics.dailyCron, 'precompute_daily_clinic_metrics', () => metricsService.precomputeDailyMetrics()),
  ];
  return scheduledJobs;
}

function stopJobs() {
  scheduledJobs.forEach((job) => job.stop());
  scheduledJobs = [];
}

module.exports = { startJobs, stopJobs, runSafely };
