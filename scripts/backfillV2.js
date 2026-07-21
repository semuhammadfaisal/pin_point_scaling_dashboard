const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const env = require('../config/env');
const v2Sync = require('../services/v2SyncService');
const logger = require('../utils/logger');

async function run() {
  const startDate = process.argv[2] || env.metrics.v2BackfillStartDate;
  const endDate = process.argv[3] || new Date().toISOString().slice(0, 10);
  if (!startDate) throw new Error('Pass a start date: npm run v2:backfill -- YYYY-MM-DD [YYYY-MM-DD].');
  await connectDatabase();
  const results = await v2Sync.backfill(startDate, endDate);
  logger.info('v2_backfill_completed', { startDate, endDate, processedDays: results.length });
}

run().catch((error) => {
  logger.error('v2_backfill_failed', { error });
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
