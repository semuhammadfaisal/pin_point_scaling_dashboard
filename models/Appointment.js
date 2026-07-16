const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    externalAppointmentId: { type: String, required: true, unique: true, trim: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
    bookedByCsrId: { type: mongoose.Schema.Types.ObjectId, ref: 'CSR', default: null, index: true },
    campaignId: { type: String, trim: true, default: '' },
    appointmentDate: { type: Date, default: null, index: true },
    createdAtExternal: { type: Date, default: null },
    status: { type: String, trim: true, default: '' },
    cancelledAt: { type: Date, default: null },
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },
    syncedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

appointmentSchema.index({ clinicId: 1, appointmentDate: -1 });
appointmentSchema.index({ bookedByCsrId: 1, appointmentDate: -1 });
appointmentSchema.index({ campaignId: 1, appointmentDate: -1 });
appointmentSchema.index({ status: 1, appointmentDate: -1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
