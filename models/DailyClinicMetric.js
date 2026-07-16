const mongoose = require('mongoose');

const dailyClinicMetricSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
    newLeads: { type: Number, min: 0, default: 0 },
    validBookings: { type: Number, min: 0, default: 0 },
    outboundDials: { type: Number, min: 0, default: 0 },
    answeredOutboundCalls: { type: Number, min: 0, default: 0 },
    answeredCalls: { type: Number, min: 0, default: 0 },
    conversations: { type: Number, min: 0, default: 0 },
    uniqueLeadsDialed: { type: Number, min: 0, default: 0 },
    talkTimeSeconds: { type: Number, min: 0, default: 0 },
    workingTimeSeconds: { type: Number, min: 0, default: 0 },
    totalGapTimeSeconds: { type: Number, min: 0, default: 0 },
    leadToBookingRate: { type: Number, min: 0, default: 0 },
    conversationToBookingRate: { type: Number, min: 0, default: 0 },
    averageSpeedToLeadSeconds: { type: Number, min: 0, default: 0 },
    medianSpeedToLeadSeconds: { type: Number, min: 0, default: 0 },
    contactedWithin1Minute: { type: Number, min: 0, max: 100, default: 0 },
    contactedWithin5Minutes: { type: Number, min: 0, max: 100, default: 0 },
    contactedWithin15Minutes: { type: Number, min: 0, max: 100, default: 0 },
    answerRate: { type: Number, min: 0, max: 100, default: 0 },
    conversationRate: { type: Number, min: 0, max: 100, default: 0 },
    talkTimeUtilization: { type: Number, min: 0, default: 0 },
    averageTalkTimePerConversation: { type: Number, min: 0, default: 0 },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

dailyClinicMetricSchema.index({ date: 1, clinicId: 1 }, { unique: true });
dailyClinicMetricSchema.index({ clinicId: 1, date: -1 });

module.exports = mongoose.model('DailyClinicMetric', dailyClinicMetricSchema);
