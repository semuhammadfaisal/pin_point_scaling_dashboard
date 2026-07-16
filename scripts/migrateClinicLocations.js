const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const Clinic = require('../models/Clinic');
const CSR = require('../models/CSR');
const Lead = require('../models/Lead');
const Call = require('../models/Call');
const Appointment = require('../models/Appointment');
const slugify = require('../utils/slugify');

async function bulkWriteInChunks(Model, operations) {
  let modified = 0;
  for (let offset = 0; offset < operations.length; offset += 500) {
    const result = await Model.bulkWrite(operations.slice(offset, offset + 500), { ordered: false });
    modified += result.modifiedCount + result.upsertedCount;
  }
  return modified;
}

async function migrate() {
  await connectDatabase();
  const source = await Clinic.findOne({ integrationSource: true }) || await Clinic.findOne({ slug: 'hot-prospector-agency' });
  if (!source) throw new Error('The account-wide Hot Prospector synchronization clinic was not found.');

  source.integrationSource = true;
  source.reportingVisible = false;
  await source.save();

  const calls = await Call.find().select('_id leadId csrId startedAt clinicId rawData.location_name').sort({ startedAt: 1 }).lean();
  const unassignedClinicName = 'Unassigned / No Location';
  const locationNames = [...new Set(calls.map((call) => String(call.rawData?.location_name || '').trim())
    .filter(Boolean).concat(unassignedClinicName))];
  await bulkWriteInChunks(Clinic, locationNames.map((name) => ({
    updateOne: {
      filter: { slug: slugify(name) },
      update: { $setOnInsert: { name, slug: slugify(name), timezone: source.timezone, active: true, reportingVisible: true } },
      upsert: true,
    },
  })));

  const clinics = await Clinic.find({ reportingVisible: { $ne: false } }).select('_id name slug').lean();
  const clinicBySlug = new Map(clinics.map((clinic) => [clinic.slug, clinic]));
  const callOperations = [];
  const leadClinic = new Map();
  const csrClinics = new Map();
  for (const call of calls) {
    const locationName = String(call.rawData?.location_name || '').trim() || unassignedClinicName;
    const target = clinicBySlug.get(slugify(locationName));
    if (!target) continue;
    callOperations.push({ updateOne: { filter: { _id: call._id }, update: { $set: { clinicId: target._id } } } });
    if (call.leadId && !leadClinic.has(String(call.leadId))) leadClinic.set(String(call.leadId), target._id);
    if (call.csrId) {
      const key = String(call.csrId);
      if (!csrClinics.has(key)) csrClinics.set(key, new Set());
      csrClinics.get(key).add(String(target._id));
    }
  }
  const callsUpdated = await bulkWriteInChunks(Call, callOperations);
  const leadsUpdated = await bulkWriteInChunks(Lead, [...leadClinic.entries()].map(([leadId, clinicId]) => ({
    updateOne: { filter: { _id: leadId }, update: { $set: { clinicId } } },
  })));
  const appointmentsUpdated = await bulkWriteInChunks(Appointment, [...leadClinic.entries()].map(([leadId, clinicId]) => ({
    updateMany: { filter: { leadId }, update: { $set: { clinicId } } },
  })));
  const csrsUpdated = await bulkWriteInChunks(CSR, [...csrClinics.entries()].map(([csrId, clinicIds]) => ({
    updateOne: { filter: { _id: csrId }, update: { $set: { clinicIds: [...clinicIds] } } },
  })));

  console.info(JSON.stringify({
    locationsCreatedOrFound: clinics.length,
    callsUpdated,
    leadsUpdated,
    appointmentsUpdated,
    csrsUpdated,
  }, null, 2));
}

migrate()
  .catch((error) => {
    console.error(`Unable to migrate clinic locations: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.connection.close());
