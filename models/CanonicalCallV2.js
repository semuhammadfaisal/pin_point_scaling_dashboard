const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    externalCallId: { type: String, required: true, unique: true, trim: true },
    externalLeadId: { type: String, trim: true, default: '', index: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    csrExternalId: { type: String, trim: true, default: '', index: true },
    campaignId: { type: String, trim: true, default: '', index: true },
    groupId: { type: String, trim: true, default: '', index: true },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    status: { type: String, required: true, trim: true },
    answered: { type: Boolean, default: null },
    conversation: { type: Boolean, default: null },
    startedAt: { type: Date, required: true, index: true },
    durationSeconds: { type: Number, min: 0, required: true },
    talkTimeSeconds: { type: Number, min: 0, default: null },
    disposition: { type: String, trim: true, default: '' },
    sourceSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceSnapshotV2', required: true },
    sourceHash: { type: String, required: true },
    normalizationVersion: { type: String, required: true, default: '2.0.0' },
    supersededAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'v2_canonical_calls' }
);

schema.index({ clinicId: 1, startedAt: 1 });
schema.index({ csrExternalId: 1, startedAt: 1 });
schema.index({ campaignId: 1, startedAt: 1 });
schema.index({ externalLeadId: 1, direction: 1, startedAt: 1 });
module.exports = mongoose.model('CanonicalCallV2', schema);
