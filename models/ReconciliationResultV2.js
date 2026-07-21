const mongoose = require('mongoose');

const metricResultSchema = new mongoose.Schema(
  {
    metric: { type: String, required: true },
    expected: { type: Number, default: null },
    actual: { type: Number, default: null },
    difference: { type: Number, default: null },
    matches: { type: Boolean, required: true },
  },
  { _id: false }
);

const reconciliationResultV2Schema = new mongoose.Schema(
  {
    reconciliationKey: { type: String, required: true, trim: true, index: true },
    snapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceSnapshotV2', required: true, index: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    sourceAsOf: { type: Date, required: true },
    status: { type: String, enum: ['certified', 'unverified', 'mismatch', 'stale'], required: true, index: true },
    metrics: { type: [metricResultSchema], default: [] },
    qualityIssues: { type: [String], default: [] },
    checkedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'v2_reconciliation_results' }
);

reconciliationResultV2Schema.index({ reconciliationKey: 1, checkedAt: -1 });

module.exports = mongoose.model('ReconciliationResultV2', reconciliationResultV2Schema);
