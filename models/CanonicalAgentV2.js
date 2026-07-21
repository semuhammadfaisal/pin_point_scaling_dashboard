const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    externalUserId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    active: { type: Boolean, default: true },
    clinicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Clinic' }],
    sourceSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceSnapshotV2', required: true },
    sourceHash: { type: String, required: true },
    normalizationVersion: { type: String, required: true, default: '2.0.0' },
  },
  { timestamps: true, collection: 'v2_canonical_agents' }
);

module.exports = mongoose.model('CanonicalAgentV2', schema);
