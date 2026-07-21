const mongoose = require('mongoose');

const clinicSourceMappingV2Schema = new mongoose.Schema(
  {
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, unique: true },
    sourceLocationId: { type: String, trim: true, default: undefined },
    sourceCampaignId: { type: String, trim: true, default: '' },
    sourceGroupId: { type: String, trim: true, default: '' },
    aliases: { type: [String], default: [] },
    timezone: { type: String, required: true, trim: true },
    timezoneVerified: { type: Boolean, required: true, default: false, index: true },
    mappingVerified: { type: Boolean, required: true, default: false, index: true },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true, collection: 'v2_clinic_source_mappings' }
);

clinicSourceMappingV2Schema.index({ sourceLocationId: 1 }, { unique: true, sparse: true });
clinicSourceMappingV2Schema.index({ aliases: 1 });

module.exports = mongoose.model('ClinicSourceMappingV2', clinicSourceMappingV2Schema);
