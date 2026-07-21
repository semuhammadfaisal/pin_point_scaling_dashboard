const Clinic = require('../models/Clinic');
const ClinicSourceMappingV2 = require('../models/ClinicSourceMappingV2');
const DataQualityIssueV2 = require('../models/DataQualityIssueV2');
const SyncCheckpointV2 = require('../models/SyncCheckpointV2');
const ReconciliationResultV2 = require('../models/ReconciliationResultV2');
const SourceSnapshotV2 = require('../models/SourceSnapshotV2');
const env = require('../config/env');

function expectedDays(startDate, endDate) {
  return Math.floor((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1;
}

async function readiness() {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = env.metrics.v2BackfillStartDate;
  const visibleClinicRows = await Clinic.find({ reportingVisible: { $ne: false }, active: true }).select('_id').lean();
  const visibleClinics = visibleClinicRows.length;
  const [verifiedMappings, criticalIssues, incompleteCheckpoints, completeCheckpoints, latestSnapshot, latestResults] = await Promise.all([
    ClinicSourceMappingV2.countDocuments({ clinicId: { $in: visibleClinicRows.map((clinic) => clinic._id) }, mappingVerified: true, timezoneVerified: true }),
    DataQualityIssueV2.countDocuments({ status: 'open', severity: 'critical' }),
    SyncCheckpointV2.countDocuments({ status: { $in: ['failed', 'running'] } }),
    SyncCheckpointV2.countDocuments({ status: 'complete', checkpointKey: /^day:/ }),
    SourceSnapshotV2.findOne({ complete: true }).sort({ sourceAsOf: -1 }).select('sourceAsOf').lean(),
    ReconciliationResultV2.aggregate([
      { $sort: { checkedAt: -1 } },
      { $group: { _id: '$filters.startDate', status: { $first: '$status' } } },
    ]),
  ]);
  const failures = [];
  if (!env.metrics.v2PipelineEnabled) failures.push('METRICS_V2_PIPELINE_ENABLED must be true for v2 cutover.');
  if (!startDate) failures.push('METRICS_V2_BACKFILL_START_DATE is not configured.');
  if (visibleClinics !== verifiedMappings) failures.push(`${verifiedMappings} of ${visibleClinics} visible clinics have verified mappings/timezones.`);
  if (criticalIssues) failures.push(`${criticalIssues} critical data-quality issues remain open.`);
  if (incompleteCheckpoints) failures.push(`${incompleteCheckpoints} backfill checkpoints are failed or running.`);
  if (startDate && completeCheckpoints < expectedDays(startDate, today)) failures.push('The all-history daily backfill is incomplete.');
  if (!latestResults.length || latestResults.some((row) => row.status !== 'certified')) failures.push('Not every reconciled day is certified.');
  if (!latestSnapshot || Date.now() - latestSnapshot.sourceAsOf.getTime() > env.metrics.v2StaleAfterMs) failures.push('The latest v2 source snapshot is stale.');
  if (!env.metrics.v2RollbackVerified) failures.push('The v2 rollback rehearsal is not marked verified.');
  return { ready: failures.length === 0, failures };
}

async function assertReady() {
  const result = await readiness();
  if (!result.ready) throw new Error(`V2 cutover blocked: ${result.failures.join(' ')}`);
  return result;
}

module.exports = { expectedDays, readiness, assertReady };
