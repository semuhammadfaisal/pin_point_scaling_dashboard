const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ['login', 'logout', 'failed_login', 'clinic_mapping_change', 'manual_sync', 'export', 'settings_change'],
      index: true,
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, index: true },
    actorEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    status: { type: String, enum: ['success', 'failure'], default: 'success', index: true },
    targetType: { type: String, trim: true, maxlength: 80, default: '' },
    targetId: { type: String, trim: true, maxlength: 180, default: '' },
    ipAddress: { type: String, trim: true, maxlength: 80, default: '' },
    userAgent: { type: String, trim: true, maxlength: 500, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
