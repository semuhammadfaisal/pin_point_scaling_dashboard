const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const syncService = require('../services/hotProspectorSyncService');
const metricsService = require('../services/metricsService');
const logger = require('../utils/logger');
const v2SyncService = require('../services/v2SyncService');
const v2ReconciliationService = require('../services/v2ReconciliationService');

const jobs = {
  recent: syncService.syncRecent,
  metrics: () => syncService.syncAgentMetrics(),
  nightly: syncService.syncPreviousSevenDays,
  recalculate: () => syncService.recalculateDailyMetrics(7),
  precompute: () => metricsService.precomputeDailyMetrics(),
  'v2-recent': v2SyncService.syncRecent,
  'v2-reconcile': () => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    return v2ReconciliationService.reconcileRange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  },
};

async function run() {
  const name = process.argv[2];
  if (!jobs[name]) throw new Error(`Unknown job "${name}". Use: ${Object.keys(jobs).join(', ')}.`);
  await connectDatabase();
  const startedAt = Date.now();
  await jobs[name]();
  logger.info('standalone_job_completed', { job: name, durationMs: Date.now() - startedAt });
}

run()
  .catch((error) => {
    logger.error('standalone_job_failed', { job: process.argv[2], error });
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
