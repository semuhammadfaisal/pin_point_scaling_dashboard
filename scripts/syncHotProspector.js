const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const Clinic = require('../models/Clinic');
const CSR = require('../models/CSR');
const Lead = require('../models/Lead');
const Call = require('../models/Call');
const Appointment = require('../models/Appointment');
const syncService = require('../services/hotProspectorSyncService');

function requestedDays() {
  const days = Number(process.argv[2] || 30);
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error('Sync days must be an integer between 1 and 366.');
  }
  return days;
}

async function ensureAccountClinic() {
  const existing = await Clinic.findOne({ integrationSource: true });
  if (existing) return existing;
  return Clinic.create({
    name: 'Hot Prospector Agency',
    slug: 'hot-prospector-agency',
    timezone: 'UTC',
    active: true,
    integrationSource: true,
    reportingVisible: false,
  });
}

async function run() {
  const days = requestedDays();
  await connectDatabase();
  const clinic = await ensureAccountClinic();
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - days * 86400000);
  const log = await syncService.syncRange(fromDate, toDate, `manual_${days}_day`);
  await syncService.recalculateDailyMetrics(days);
  const [csrs, leads, calls, appointments] = await Promise.all([
    CSR.countDocuments(),
    Lead.countDocuments({ clinicId: clinic._id }),
    Call.countDocuments({ clinicId: clinic._id }),
    Appointment.countDocuments({ clinicId: clinic._id }),
  ]);
  console.info(JSON.stringify({
    status: log.status,
    fetched: log.recordsFetched,
    created: log.recordsCreated,
    updated: log.recordsUpdated,
    failed: log.recordsFailed,
    totals: { clinics: 1, csrs, leads, calls, appointments },
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(`Unable to synchronize Hot Prospector: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
