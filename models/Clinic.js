const mongoose = require('mongoose');

const clinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 120 },
    hotProspectorCampaignId: { type: String, trim: true, maxlength: 200, default: null, index: true },
    hotProspectorGroupId: { type: String, trim: true, maxlength: 200, default: null, index: true },
    timezone: { type: String, required: true, default: 'UTC', trim: true },
    active: { type: Boolean, default: true, index: true },
    integrationSource: { type: Boolean, default: false, index: true },
    reportingVisible: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

clinicSchema.index({ hotProspectorCampaignId: 1, active: 1 });

module.exports = mongoose.model('Clinic', clinicSchema);
