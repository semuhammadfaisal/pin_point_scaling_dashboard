const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema(
  {
    syncType: { type: String, required: true, trim: true, index: true },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null },
    status: { type: String, enum: ['running', 'success', 'partial', 'failed'], default: 'running', index: true },
    recordsFetched: { type: Number, min: 0, default: 0 },
    recordsCreated: { type: Number, min: 0, default: 0 },
    recordsUpdated: { type: Number, min: 0, default: 0 },
    recordsFailed: { type: Number, min: 0, default: 0 },
    errorMessage: { type: String, default: '', maxlength: 2000 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

syncLogSchema.index({ startedAt: -1 });

module.exports = mongoose.model('SyncLog', syncLogSchema);
