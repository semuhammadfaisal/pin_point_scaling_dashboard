const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
  {
    externalCallId: { type: String, required: true, unique: true, trim: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
    csrId: { type: mongoose.Schema.Types.ObjectId, ref: 'CSR', default: null, index: true },
    campaignId: { type: String, trim: true, default: '' },
    direction: { type: String, enum: ['inbound', 'outbound', 'unknown'], default: 'unknown' },
    status: { type: String, trim: true, default: '' },
    answered: { type: Boolean, default: false },
    conversation: { type: Boolean, default: false },
    startedAt: { type: Date, default: null, index: true },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSeconds: { type: Number, min: 0, default: 0 },
    talkTimeSeconds: { type: Number, min: 0, default: 0 },
    disposition: { type: String, trim: true, default: '' },
    recordingUrl: { type: String, trim: true, default: '' },
    speedToLeadSeconds: { type: Number, min: 0, default: 0 },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    syncedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

callSchema.index({ clinicId: 1, startedAt: -1 });
callSchema.index({ csrId: 1, startedAt: -1 });
callSchema.index({ leadId: 1, direction: 1, startedAt: 1 });
callSchema.index({ campaignId: 1, startedAt: -1 });
callSchema.index({ status: 1, startedAt: -1 });
callSchema.index({ direction: 1, startedAt: -1 });

module.exports = mongoose.model('Call', callSchema);
