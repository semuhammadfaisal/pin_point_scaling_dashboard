const mongoose = require('mongoose');

const dailyAgentMetricSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    csrId: { type: mongoose.Schema.Types.ObjectId, ref: 'CSR', required: true },
    inboundCalls: { type: Number, min: 0, default: 0 },
    outboundCalls: { type: Number, min: 0, default: 0 },
    answeredCalls: { type: Number, min: 0, default: 0 },
    conversations: { type: Number, min: 0, default: 0 },
    appointments: { type: Number, min: 0, default: 0 },
    talkTimeSeconds: { type: Number, min: 0, default: 0 },
    gapTimeSeconds: { type: Number, min: 0, default: 0 },
    firstCallAt: { type: Date, default: null },
    lastCallAt: { type: Date, default: null },
    workingTimeSeconds: { type: Number, min: 0, default: 0 },
    answerRate: { type: Number, min: 0, max: 100, default: 0 },
    conversionRate: { type: Number, min: 0, max: 100, default: 0 },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    syncedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

dailyAgentMetricSchema.index({ date: 1, clinicId: 1, csrId: 1 }, { unique: true });
dailyAgentMetricSchema.index({ clinicId: 1, date: -1 });

module.exports = mongoose.model('DailyAgentMetric', dailyAgentMetricSchema);
