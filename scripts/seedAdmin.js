const mongoose = require('mongoose');
const env = require('../config/env');
const connectDatabase = require('../config/db');
const Admin = require('../models/Admin');
const { assertStrongPassword } = require('../utils/passwordPolicy');

async function seedAdmin() {
  assertStrongPassword(env.admin.password, 'ADMIN_PASSWORD');

  await connectDatabase();

  const email = env.admin.email.trim().toLowerCase();
  const existingAdmin = await Admin.findOne({ email });

  if (existingAdmin) {
    console.info(`Admin already exists: ${email}`);
    return;
  }

  const admin = await Admin.create({
    name: env.admin.name.trim(),
    email,
    password: env.admin.password,
  });

  console.info(`Admin created successfully: ${admin.email}`);
}

seedAdmin()
  .catch((error) => {
    console.error(`Unable to seed admin: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
