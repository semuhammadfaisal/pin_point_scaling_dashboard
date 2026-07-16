const Admin = require('../models/Admin');

async function authenticateAdmin(email, password) {
  const admin = await Admin.findOne({ email: email.toLowerCase(), isActive: true }).select('+password');
  if (!admin || !(await admin.comparePassword(password))) return null;

  admin.lastLoginAt = new Date();
  await admin.save({ validateModifiedOnly: true });
  return admin;
}

module.exports = { authenticateAdmin };
