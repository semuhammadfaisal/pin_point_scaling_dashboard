const mongoose = require('mongoose');

const sourceSnapshotV2Schema = new mongoose.Schema(
  {
    endpointKey: { type: String, required: true, trim: true, index: true },
    requestFingerprint: { type: String, required: true, trim: true, index: true },
    responseHash: { type: String, required: true, trim: true, index: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    sourceAsOf: { type: Date, required: true, index: true },
    fetchedAt: { type: Date, required: true, default: Date.now, index: true },
    normalizationVersion: { type: String, required: true, default: '2.0.0' },
    recordCount: { type: Number, min: 0, required: true, default: 0 },
    expectedRecordCount: { type: Number, min: 0, default: null },
    complete: { type: Boolean, required: true, default: false, index: true },
    sanitized: { type: Boolean, required: true, default: false },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'v2_source_snapshots' }
);

sourceSnapshotV2Schema.index({ endpointKey: 1, requestFingerprint: 1, fetchedAt: -1 });
sourceSnapshotV2Schema.index({ responseHash: 1, requestFingerprint: 1, sourceAsOf: -1 });

module.exports = mongoose.model('SourceSnapshotV2', sourceSnapshotV2Schema);
