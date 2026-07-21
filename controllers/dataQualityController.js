const SourceSnapshotV2 = require('../models/SourceSnapshotV2');
const SyncCheckpointV2 = require('../models/SyncCheckpointV2');
const ReconciliationResultV2 = require('../models/ReconciliationResultV2');
const DataQualityIssueV2 = require('../models/DataQualityIssueV2');
const ClinicSourceMappingV2 = require('../models/ClinicSourceMappingV2');
const Clinic = require('../models/Clinic');
const v2Sync = require('../services/v2SyncService');
const reconciliation = require('../services/v2ReconciliationService');
const logger = require('../utils/logger');
const { setFlash } = require('../middleware/flash');
const { recordAudit } = require('../services/auditService');

const page = {
  layout: 'layouts/main', title: 'Data Certification', pageTitle: 'Data certification',
  pageDescription: 'Source snapshots, reconciliation, mappings, and quality gates for the v2 dataset.',
};

async function dashboardData() {
  const [reconciliations, issues, checkpoints, snapshots, mappingCounts] = await Promise.all([
    ReconciliationResultV2.find().sort({ checkedAt: -1 }).limit(30).lean(),
    DataQualityIssueV2.find({ status: 'open' }).sort({ severity: 1, lastSeenAt: -1 }).limit(100).lean(),
    SyncCheckpointV2.find().sort({ updatedAt: -1 }).limit(30).lean(),
    SourceSnapshotV2.find().sort({ fetchedAt: -1 }).limit(30).select('-payload').lean(),
    ClinicSourceMappingV2.aggregate([{ $group: { _id: null, total: { $sum: 1 }, verified: { $sum: { $cond: [{ $and: ['$mappingVerified', '$timezoneVerified'] }, 1, 0] } } } }]),
  ]);
  return {
    reconciliations, issues, checkpoints, snapshots,
    mappings: mappingCounts[0] || { total: 0, verified: 0 },
  };
}

async function show(req, res) {
  res.render('settings/data-quality', { ...page, ...(await dashboardData()) });
}

async function status(_req, res) {
  res.json({ success: true, ...(await dashboardData()), generatedAt: new Date().toISOString() });
}

async function startBackfill(req, res) {
  const startDate = String(req.body.startDate || '').trim();
  const endDate = String(req.body.endDate || new Date().toISOString().slice(0, 10)).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    setFlash(req, 'error', 'Enter a valid backfill start and end date.');
    return res.redirect('/settings/data-quality');
  }
  await recordAudit(req, 'manual_sync', { metadata: { operation: 'v2_backfill', startDate, endDate } });
  setImmediate(() => v2Sync.backfill(startDate, endDate).catch((error) => logger.error('v2_backfill_failed', { error, startDate, endDate })));
  setFlash(req, 'success', `V2 backfill queued for ${startDate} through ${endDate}.`);
  return res.redirect('/settings/data-quality');
}

async function startReconciliation(req, res) {
  const startDate = String(req.body.startDate || '').trim();
  const endDate = String(req.body.endDate || startDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < startDate) {
    setFlash(req, 'error', 'Enter a valid reconciliation date range.');
    return res.redirect('/settings/data-quality');
  }
  await recordAudit(req, 'settings_change', { metadata: { operation: 'v2_reconciliation', startDate, endDate } });
  setImmediate(() => reconciliation.reconcileRange(startDate, endDate)
    .catch((error) => logger.error('v2_reconciliation_failed', { error, startDate, endDate })));
  setFlash(req, 'success', `Reconciliation queued for ${startDate} through ${endDate}.`);
  return res.redirect('/settings/data-quality');
}

async function mappingStatus(_req, res) {
  const clinics = await Clinic.find({ reportingVisible: { $ne: false } }).select('name timezone').sort({ name: 1 }).lean();
  const mappings = await ClinicSourceMappingV2.find({ clinicId: { $in: clinics.map((clinic) => clinic._id) } }).lean();
  const byClinic = new Map(mappings.map((mapping) => [String(mapping.clinicId), mapping]));
  res.json({
    success: true,
    data: clinics.map((clinic) => ({ clinic, mapping: byClinic.get(String(clinic._id)) || null })),
    generatedAt: new Date().toISOString(),
  });
}

module.exports = { show, status, startBackfill, startReconciliation, mappingStatus };
