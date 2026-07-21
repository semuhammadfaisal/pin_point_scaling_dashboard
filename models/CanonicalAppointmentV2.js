const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    externalAppointmentId: { type: String, required: true, unique: true, trim: true },
    externalLeadId: { type: String, trim: true, default: '', index: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    csrExternalId: { type: String, trim: true, default: '', index: true },
    campaignId: { type: String, trim: true, default: '', index: true },
    status: { type: String, required: true, trim: true, index: true },
    appointmentDate: { type: Date, required: true, index: true },
    createdAtExternal: { type: Date, default: null },
    sourceSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'SourceSnapshotV2', required: true },
    sourceHash: { type: String, required: true },
    normalizationVersion: { type: String, required: true, default: '2.0.0' },
    supersededAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'v2_canonical_appointments' }
);

schema.index({ clinicId: 1, appointmentDate: 1 });
schema.index({ csrExternalId: 1, appointmentDate: 1 });
module.exports = mongoose.model('CanonicalAppointmentV2', schema);
