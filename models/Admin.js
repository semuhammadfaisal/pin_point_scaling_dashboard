const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { assertStrongPassword } = require('../utils/passwordPolicy');

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: true,
      minlength: 12,
      maxlength: 128,
      select: false,
    },
    lastLoginAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

adminSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  assertStrongPassword(this.password);
  this.password = await bcrypt.hash(this.password, 12);
});

adminSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

adminSchema.set('toJSON', {
  transform(_doc, result) {
    delete result.password;
    return result;
  },
});

module.exports = mongoose.model('Admin', adminSchema);
