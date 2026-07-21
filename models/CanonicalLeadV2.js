const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    externalLeadId: { type: String, required: true, unique: true, trim: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    csrExternalId: { type: String, trim: true, default: '', index: true },
    campaignId: { type: String, trim: true, default: '', index: true },
    groupId: { type: String, trim: true, default: '', index: true },
    createdAtExternal: { type: Date, required: true, index: true },
    firstDialAt: { type: Date, default: null },
    sourceSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceSnapshotV2', required: true },
    sourceHash: { type: String, required: true },
    normalizationVersion: { type: String, required: true, default: '2.0.0' },
    supersededAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'v2_canonical_leads' }
);

schema.index({ clinicId: 1, createdAtExternal: 1 });
schema.index({ campaignId: 1, createdAtExternal: 1 });
module.exports = mongoose.model('CanonicalLeadV2', schema);
