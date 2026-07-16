const mongoose = require('mongoose');

const csrSchema = new mongoose.Schema(
  {
    externalUserId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    active: { type: Boolean, default: true, index: true },
    clinicIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Clinic' }],
  },
  { timestamps: true }
);

csrSchema.index({ clinicIds: 1, active: 1 });

module.exports = mongoose.model('CSR', csrSchema);
