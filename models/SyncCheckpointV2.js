const mongoose = require('mongoose');

const syncCheckpointV2Schema = new mongoose.Schema(
  {
    checkpointKey: { type: String, required: true, unique: true, trim: true },
    endpointKey: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['pending', 'running', 'complete', 'failed'], default: 'pending', index: true },
    rangeStart: { type: Date, default: null },
    rangeEnd: { type: Date, default: null },
    nextOffset: { type: Number, min: 0, default: 0 },
    pagesFetched: { type: Number, min: 0, default: 0 },
    recordsFetched: { type: Number, min: 0, default: 0 },
    expectedRecords: { type: Number, min: 0, default: null },
    lastError: { type: String, maxlength: 2000, default: '' },
    lastAttemptAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'v2_sync_checkpoints' }
);

module.exports = mongoose.model('SyncCheckpointV2', syncCheckpointV2Schema);
