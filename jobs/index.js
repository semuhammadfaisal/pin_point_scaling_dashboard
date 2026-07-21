const cron = require('node-cron');
const loginRateLimiter = require('../middleware/loginRateLimiter');
const env = require('../config/env');
const syncService = require('../services/hotProspectorSyncService');
const metricsService = require('../services/metricsService');
const lockService = require('../services/jobLockService');
const logger = require('../utils/logger');
const v2SyncService = require('../services/v2SyncService');
const v2ReconciliationService = require('../services/v2ReconciliationService');

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
  if (env.metrics.v2PipelineEnabled) {
    scheduledJobs.push(
      schedule(env.metrics.v2RecentCron, 'v2_sync_recent', v2SyncService.syncRecent),
      schedule(env.metrics.v2ReconcileCron, 'v2_reconcile_recent', () => {
        const end = new Date();
        const start = new Date(end.getTime() - 7 * 86400000);
        return v2ReconciliationService.reconcileRange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
      })
    );
  }
  return scheduledJobs;
}

function stopJobs() {
  scheduledJobs.forEach((job) => job.stop());
  scheduledJobs = [];
}

module.exports = { startJobs, stopJobs, runSafely };
