const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    scopeType: { type: String, enum: ['agency', 'clinic', 'csr'], required: true },
    scopeKey: { type: String, required: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', default: null },
    csrExternalId: { type: String, trim: true, default: '' },
    campaignId: { type: String, trim: true, default: '' },
    groupId: { type: String, trim: true, default: '' },
    timezone: { type: String, required: true },
    newLeads: { type: Number, min: 0, default: 0 },
    outboundDials: { type: Number, min: 0, default: 0 },
    answeredCalls: { type: Number, min: 0, default: null },
    decisionMakers: { type: Number, min: 0, default: null },
    conversations: { type: Number, min: 0, default: null },
    validBookings: { type: Number, min: 0, default: null },
    talkTimeSeconds: { type: Number, min: 0, default: null },
    gapTimeSeconds: { type: Number, min: 0, default: null },
    workingTimeSeconds: { type: Number, min: 0, default: null },
    uniqueLeadsDialed: { type: Number, min: 0, default: 0 },
    speedToLeadTotalSeconds: { type: Number, min: 0, default: 0 },
    speedToLeadSampleSize: { type: Number, min: 0, default: 0 },
    source: { type: String, enum: ['hot_prospector', 'canonical_v2'], required: true },
    sourceAsOf: { type: Date, required: true, index: true },
    sourceSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceSnapshotV2', required: true },
    certification: { type: String, enum: ['certified', 'unverified', 'mismatch', 'stale'], default: 'unverified' },
    qualityIssues: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'v2_daily_metrics' }
);

schema.index({ date: 1, scopeType: 1, scopeKey: 1 }, { unique: true });
schema.index({ scopeType: 1, scopeKey: 1, date: 1 });
schema.index({ clinicId: 1, date: 1 });
schema.index({ csrExternalId: 1, date: 1 });
schema.index({ campaignId: 1, groupId: 1, date: 1 });
module.exports = mongoose.model('DailyMetricV2', schema);
