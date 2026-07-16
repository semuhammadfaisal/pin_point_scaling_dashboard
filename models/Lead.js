const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    externalLeadId: { type: String, required: true, unique: true, trim: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    assignedCsrId: { type: mongoose.Schema.Types.ObjectId, ref: 'CSR', default: null, index: true },
    campaignId: { type: String, trim: true, default: '' },
    groupId: { type: String, trim: true, default: '' },
    source: { type: String, trim: true, default: '' },
    status: { type: String, trim: true, default: '' },
    createdAtExternal: { type: Date, default: null },
    firstDialAt: { type: Date, default: null },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    syncedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

leadSchema.index({ clinicId: 1, campaignId: 1, syncedAt: -1 });
leadSchema.index({ createdAtExternal: -1 });
leadSchema.index({ status: 1, createdAtExternal: -1 });
leadSchema.index({ campaignId: 1, createdAtExternal: -1 });
leadSchema.index({ groupId: 1, createdAtExternal: -1 });
leadSchema.index({ clinicId: 1, createdAtExternal: -1 });
leadSchema.index({ assignedCsrId: 1, createdAtExternal: -1 });

module.exports = mongoose.model('Lead', leadSchema);
