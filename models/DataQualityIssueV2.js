const mongoose = require('mongoose');

const dataQualityIssueV2Schema = new mongoose.Schema(
  {
    issueKey: { type: String, required: true, unique: true, trim: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], required: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['open', 'resolved', 'ignored'], default: 'open', index: true },
    entityType: { type: String, trim: true, default: '' },
    externalId: { type: String, trim: true, default: '' },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', default: null, index: true },
    message: { type: String, required: true, maxlength: 2000 },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    firstSeenAt: { type: Date, required: true, default: Date.now },
    lastSeenAt: { type: Date, required: true, default: Date.now, index: true },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'v2_data_quality_issues' }
);

dataQualityIssueV2Schema.index({ status: 1, severity: 1, lastSeenAt: -1 });

module.exports = mongoose.model('DataQualityIssueV2', dataQualityIssueV2Schema);
