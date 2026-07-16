const Clinic = require('../models/Clinic');
const CSR = require('../models/CSR');
const Lead = require('../models/Lead');
const Call = require('../models/Call');
const Appointment = require('../models/Appointment');
const DailyAgentMetric = require('../models/DailyAgentMetric');
const SyncLog = require('../models/SyncLog');
const api = require('./hotProspectorApiService');
const normalizer = require('./hotProspectorNormalizer');
const { formatApiDate, startOfUtcDay } = require('../utils/date');
const { logApiError } = require('../utils/apiLogger');
const slugify = require('../utils/slugify');
const lockService = require('./jobLockService');
const env = require('../config/env');

function createCounters() {
  return { fetched: 0, created: 0, updated: 0, failed: 0, errors: [] };
}

async function getSyncSourceClinics() {
  const clinics = await Clinic.find({ active: true });
  const dedicatedSources = clinics.filter((clinic) => clinic.integrationSource);
  if (dedicatedSources.length) return dedicatedSources;
  const mapped = clinics.filter((clinic) => clinic.hotProspectorCampaignId || clinic.hotProspectorGroupId);
  return mapped.length ? mapped : clinics.slice(0, 1);
}

function recordError(counters, error, context) {
  counters.failed += 1;
  counters.errors.push({ context, message: error.message });
  logApiError(error, { operation: 'sync_record', ...context });
}

async function upsert(Model, filter, values, counters, options = {}) {
  const update = { $set: values };
  if (options.addToSet) update.$addToSet = options.addToSet;
  const result = await Model.updateOne(filter, update, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  if (result.upsertedCount) counters.created += 1;
  else counters.updated += 1;
  return Model.findOne(filter);
}

async function runLoggedSync(syncType, metadata, work) {
  const lockName = `sync:${syncType}`;
  const acquired = await lockService.acquire(lockName, Math.max(env.cronLockTtlMs, 60 * 60 * 1000));
  if (!acquired) {
    return SyncLog.create({
      syncType, metadata: { ...metadata, duplicatePrevented: true }, startedAt: new Date(), completedAt: new Date(),
      status: 'partial', errorMessage: 'A synchronization of this type is already running.',
    });
  }
  const log = await SyncLog.create({ syncType, metadata, startedAt: new Date(), status: 'running' });
  const counters = createCounters();
  try {
    await work(counters);
    log.status = counters.failed > 0 ? 'partial' : 'success';
  } catch (error) {
    log.status = 'failed';
    log.errorMessage = error.message;
    recordError(counters, error, { syncType });
  } finally {
    log.completedAt = new Date();
    log.recordsFetched = counters.fetched;
    log.recordsCreated = counters.created;
    log.recordsUpdated = counters.updated;
    log.recordsFailed = counters.failed;
    log.metadata = { ...metadata, errors: counters.errors.slice(0, 50) };
    try {
      await log.save();
    } finally {
      await lockService.release(lockName);
    }
  }
  return log;
}

async function syncCsrs(counters) {
  const records = await api.fetchUsers();
  counters.fetched += records.length;
  for (const record of records) {
    try {
      const csr = normalizer.normalizeCsr(record);
      if (!csr.externalUserId) throw new Error('Agent record is missing an external user ID.');
      await upsert(CSR, { externalUserId: csr.externalUserId }, csr, counters);
    } catch (error) {
      recordError(counters, error, { entity: 'csr' });
    }
  }
}

async function resolveCsr(record, clinic, counters) {
  const externalUserId = String(
    normalizer.pick(record, 'memberId', 'agentId', 'userId', 'csrId', 'bookedBy') || ''
  ).trim();
  const email = String(normalizer.pick(record, 'agentEmail', 'email') || '').trim().toLowerCase();
  const name = String(normalizer.pick(record, 'caller_name', 'agentName', 'csrName') || '').trim();
  let csr = externalUserId ? await CSR.findOne({ externalUserId }) : null;
  if (!csr && email) csr = await CSR.findOne({ email });
  if (!csr && name) csr = await CSR.findOne({ name });

  if (!csr && externalUserId) {
    csr = await upsert(
      CSR,
      { externalUserId },
      { externalUserId, name: name || `Agent ${externalUserId}`, email, active: true },
      counters,
      { addToSet: { clinicIds: clinic._id } }
    );
  } else if (csr && !csr.clinicIds.some((id) => id.equals(clinic._id))) {
    await CSR.updateOne({ _id: csr._id }, { $addToSet: { clinicIds: clinic._id } });
  }
  return csr;
}

async function resolveLead(record, clinic, csrId, counters) {
  const externalLeadId = String(normalizer.pick(record, 'LeadId', 'leadId', 'externalLeadId') || '').trim();
  if (!externalLeadId) return null;
  const values = normalizer.normalizeLead(record, clinic, csrId);
  const existing = await Lead.findOne({ externalLeadId }).select('createdAtExternal firstDialAt').lean();
  if (existing?.createdAtExternal && (!values.createdAtExternal || existing.createdAtExternal < values.createdAtExternal)) {
    values.createdAtExternal = existing.createdAtExternal;
  }
  if (existing?.firstDialAt && (!values.firstDialAt || existing.firstDialAt < values.firstDialAt)) {
    values.firstDialAt = existing.firstDialAt;
  }
  return upsert(Lead, { externalLeadId }, values, counters);
}

async function syncCallsForClinic(clinic, fromDate, toDate, counters) {
  const records = await api.fetchUserCallLogs({
    fromDate: formatApiDate(fromDate, clinic.timezone),
    toDate: formatApiDate(toDate, clinic.timezone),
    campaignId: clinic.hotProspectorCampaignId || '',
    groupId: clinic.hotProspectorGroupId || '',
  });
  counters.fetched += records.length;

  const unassignedClinicName = 'Unassigned / No Location';
  const locationNames = [...new Set(records.map((record) =>
    String(normalizer.pick(record, 'location_name', 'locationName') || '').trim()
  ).filter(Boolean).concat(unassignedClinicName))];
  if (locationNames.length) {
    await Clinic.bulkWrite(locationNames.map((name) => ({
      updateOne: {
        filter: { slug: slugify(name) },
        update: { $setOnInsert: { name, slug: slugify(name), timezone: clinic.timezone, active: true, reportingVisible: true } },
        upsert: true,
      },
    })), { ordered: false });
  }
  const locationClinics = await Clinic.find({ slug: { $in: locationNames.map(slugify) } }).lean();
  const clinicByLocation = new Map(locationClinics.map((item) => [item.name.trim().toLowerCase(), item]));
  const clinicForRecord = (record) => {
    const name = String(normalizer.pick(record, 'location_name', 'locationName') || '').trim().toLowerCase();
    return clinicByLocation.get(name) || clinicByLocation.get(unassignedClinicName.toLowerCase()) || clinic;
  };

  const csrs = await CSR.find().lean();
  const csrByExternalId = new Map(csrs.filter((csr) => csr.externalUserId).map((csr) => [csr.externalUserId, csr]));
  const csrByEmail = new Map(csrs.filter((csr) => csr.email).map((csr) => [csr.email.toLowerCase(), csr]));
  const csrByName = new Map(csrs.filter((csr) => csr.name).map((csr) => [csr.name.toLowerCase(), csr]));
  const csrForRecord = (record) => {
    const externalId = String(normalizer.pick(record, 'memberId', 'agentId', 'userId', 'csrId') || '').trim();
    const email = String(normalizer.pick(record, 'agentEmail', 'email') || '').trim().toLowerCase();
    const name = String(normalizer.pick(record, 'caller_name', 'agentName', 'csrName') || '').trim().toLowerCase();
    return csrByExternalId.get(externalId) || csrByEmail.get(email) || csrByName.get(name) || null;
  };
  const externalLeadIds = [...new Set(records.map((record) =>
    String(normalizer.pick(record, 'LeadId', 'leadId', 'externalLeadId') || '').trim()
  ).filter(Boolean))];
  const existingLeads = await Lead.find({ externalLeadId: { $in: externalLeadIds } }).lean();
  const existingLeadByExternalId = new Map(existingLeads.map((lead) => [lead.externalLeadId, lead]));
  const leadValues = new Map();
  const csrClinicPairs = new Map();

  for (const record of records) {
    try {
      const externalLeadId = String(normalizer.pick(record, 'LeadId', 'leadId', 'externalLeadId') || '').trim();
      if (!externalLeadId) continue;
      const csr = csrForRecord(record);
      const targetClinic = clinicForRecord(record);
      if (csr) csrClinicPairs.set(`${csr._id}|${targetClinic._id}`, { csrId: csr._id, clinicId: targetClinic._id });
      const values = normalizer.normalizeLead(record, targetClinic, csr?._id || null);
      const pending = leadValues.get(externalLeadId);
      const existing = pending || existingLeadByExternalId.get(externalLeadId);
      if (existing?.createdAtExternal && (!values.createdAtExternal || existing.createdAtExternal < values.createdAtExternal)) {
        values.createdAtExternal = existing.createdAtExternal;
      }
      if (existing?.firstDialAt && (!values.firstDialAt || existing.firstDialAt < values.firstDialAt)) {
        values.firstDialAt = existing.firstDialAt;
      }
      leadValues.set(externalLeadId, { ...pending, ...values, externalLeadId });
    } catch (error) {
      recordError(counters, error, { entity: 'lead', clinicId: String(clinic._id) });
    }
  }

  const leadOperations = [...leadValues.entries()].map(([externalLeadId, values]) => ({
    updateOne: {
      filter: { externalLeadId },
      update: { $set: values },
      upsert: true,
    },
  }));
  for (let offset = 0; offset < leadOperations.length; offset += 500) {
    const result = await Lead.bulkWrite(leadOperations.slice(offset, offset + 500), { ordered: false });
    counters.created += result.upsertedCount;
    counters.updated += result.matchedCount;
  }
  for (const { csrId, clinicId } of csrClinicPairs.values()) {
    await CSR.updateOne({ _id: csrId }, { $addToSet: { clinicIds: clinicId } });
  }

  const persistedLeads = await Lead.find({ externalLeadId: { $in: externalLeadIds } }).select('_id externalLeadId').lean();
  const leadByExternalId = new Map(persistedLeads.map((lead) => [lead.externalLeadId, lead]));
  const callOperations = [];
  for (const record of records) {
    try {
      const externalLeadId = String(normalizer.pick(record, 'LeadId', 'leadId', 'externalLeadId') || '').trim();
      const csr = csrForRecord(record);
      const lead = leadByExternalId.get(externalLeadId);
      const targetClinic = clinicForRecord(record);
      const call = normalizer.normalizeCall(record, targetClinic, lead?._id || null, csr?._id || null);
      if (!call.externalCallId) throw new Error('Call record is missing a stable external ID.');
      callOperations.push({
        updateOne: {
          filter: { externalCallId: call.externalCallId },
          update: { $set: call },
          upsert: true,
        },
      });
    } catch (error) {
      recordError(counters, error, { entity: 'call', clinicId: String(clinic._id) });
    }
  }
  for (let offset = 0; offset < callOperations.length; offset += 500) {
    const result = await Call.bulkWrite(callOperations.slice(offset, offset + 500), { ordered: false });
    counters.created += result.upsertedCount;
    counters.updated += result.matchedCount;
  }
}

async function syncLeadsForClinic(clinic, fromDate, toDate, counters) {
  if (!clinic.hotProspectorGroupId) return;
  const records = await api.fetchLeads({
    groupId: clinic.hotProspectorGroupId,
    fromDate: formatApiDate(fromDate, clinic.timezone),
    toDate: formatApiDate(toDate, clinic.timezone),
  });
  counters.fetched += records.length;
  for (const record of records) {
    try {
      const csr = await resolveCsr(record, clinic, counters);
      const lead = normalizer.normalizeLead(record, clinic, csr?._id || null);
      if (!lead.externalLeadId) throw new Error('Lead record is missing an external lead ID.');
      await upsert(Lead, { externalLeadId: lead.externalLeadId }, lead, counters);
    } catch (error) {
      recordError(counters, error, { entity: 'lead', clinicId: String(clinic._id) });
    }
  }
}

async function syncAppointmentsForClinic(clinic, fromDate, toDate, counters) {
  const records = await api.fetchAppointments({
    campaignId: clinic.hotProspectorCampaignId || '',
    groupId: clinic.hotProspectorGroupId || '',
    fromDate: formatApiDate(fromDate, clinic.timezone),
    toDate: formatApiDate(toDate, clinic.timezone),
  });
  counters.fetched += records.length;
  for (const record of records) {
    try {
      const csr = await resolveCsr(record, clinic, counters);
      const lead = await resolveLead(record, clinic, csr?._id || null, counters);
      const appointment = normalizer.normalizeAppointment(record, clinic, lead?._id || null, csr?._id || null);
      await upsert(Appointment, { externalAppointmentId: appointment.externalAppointmentId }, appointment, counters);
    } catch (error) {
      recordError(counters, error, { entity: 'appointment', clinicId: String(clinic._id) });
    }
  }
}

async function syncTranscriptsForClinic(clinic, fromDate, toDate, counters) {
  const records = await api.fetchCallTranscripts({
    fromDate: formatApiDate(fromDate, clinic.timezone),
    toDate: formatApiDate(toDate, clinic.timezone),
    campaignId: clinic.hotProspectorCampaignId || '',
    groupId: clinic.hotProspectorGroupId || '',
  });
  counters.fetched += records.length;
  for (const record of records) {
    try {
      const normalized = normalizer.normalizeCall(record, clinic);
      const result = await Call.updateOne(
        { externalCallId: normalized.externalCallId },
        {
          $set: {
            conversation: true,
            'rawData.transcript': record,
            syncedAt: new Date(),
          },
        }
      );
      if (result.matchedCount) counters.updated += 1;
    } catch (error) {
      recordError(counters, error, { entity: 'transcript', clinicId: String(clinic._id) });
    }
  }
}

async function syncRange(fromDate, toDate, syncType = 'range') {
  return runLoggedSync(syncType, { fromDate, toDate }, async (counters) => {
    try {
      await syncCsrs(counters);
    } catch (error) {
      recordError(counters, error, { operation: 'sync_csrs' });
    }
    const clinics = await getSyncSourceClinics();
    for (const clinic of clinics) {
      const tasks = [syncCallsForClinic, syncLeadsForClinic, syncAppointmentsForClinic, syncTranscriptsForClinic];
      for (const task of tasks) {
        try {
          await task(clinic, fromDate, toDate, counters);
        } catch (error) {
          recordError(counters, error, { operation: task.name, clinicId: String(clinic._id) });
        }
      }
    }
  });
}

async function syncRecent() {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
  return syncRange(fromDate, toDate, 'recent');
}

async function syncPreviousSevenDays() {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const rangeLog = await syncRange(fromDate, toDate, 'nightly_7_day');
  for (let daysAgo = 1; daysAgo <= 7; daysAgo += 1) {
    const date = new Date(toDate.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    await syncAgentMetrics(date, 'nightly_agent_metrics');
  }
  return rangeLog;
}

async function syncAgentMetrics(date = new Date(), syncType = 'agent_metrics') {
  return runLoggedSync(syncType, { date }, async (counters) => {
    const clinics = await getSyncSourceClinics();
    for (const clinic of clinics) {
      try {
        const apiDate = formatApiDate(date, clinic.timezone);
        const records = clinic.hotProspectorCampaignId
          ? await api.fetchCampaignDashboardData(clinic.hotProspectorCampaignId, apiDate)
          : await api.fetchMemberDashboardData(apiDate);
        counters.fetched += records.length;
        for (const record of records) {
          try {
            const csr = await resolveCsr(record, clinic, counters);
            if (!csr) throw new Error('Metric record could not be matched to a CSR.');
            const metricDate = new Date(`${apiDate}T00:00:00.000Z`);
            const metric = normalizer.normalizeDailyMetric(record, clinic, csr._id, metricDate);
            await upsert(
              DailyAgentMetric,
              { date: metric.date, clinicId: clinic._id, csrId: csr._id },
              metric,
              counters
            );
          } catch (error) {
            recordError(counters, error, { entity: 'daily_metric', clinicId: String(clinic._id) });
          }
        }
      } catch (error) {
        recordError(counters, error, { operation: 'fetch_metrics', clinicId: String(clinic._id) });
      }
    }
  });
}

async function recalculateDailyMetrics(days = 7) {
  return runLoggedSync('recalculate_metrics', { days }, async (counters) => {
    const end = startOfUtcDay(new Date());
    const start = new Date(end.getTime() - Math.max(1, days) * 86400000);
    const calls = await Call.find({ startedAt: { $gte: start, $lt: new Date(end.getTime() + 86400000) }, csrId: { $ne: null } })
      .sort({ startedAt: 1 })
      .lean();
    const appointments = await Appointment.find({
      appointmentDate: { $gte: start, $lt: new Date(end.getTime() + 86400000) },
      bookedByCsrId: { $ne: null },
    }).lean();
    const clinics = await Clinic.find().select('_id timezone').lean();
    const timezoneByClinic = new Map(clinics.map((clinic) => [String(clinic._id), clinic.timezone]));
    counters.fetched += calls.length + appointments.length;

    const buckets = new Map();
    for (const call of calls) {
      const timezone = timezoneByClinic.get(String(call.clinicId)) || 'UTC';
      const date = new Date(`${formatApiDate(call.startedAt, timezone)}T00:00:00.000Z`);
      const key = `${date.toISOString()}|${call.clinicId}|${call.csrId}`;
      if (!buckets.has(key)) buckets.set(key, { date, clinicId: call.clinicId, csrId: call.csrId, calls: [], appointments: 0 });
      buckets.get(key).calls.push(call);
    }
    for (const appointment of appointments) {
      const timezone = timezoneByClinic.get(String(appointment.clinicId)) || 'UTC';
      const date = new Date(`${formatApiDate(appointment.appointmentDate, timezone)}T00:00:00.000Z`);
      const key = `${date.toISOString()}|${appointment.clinicId}|${appointment.bookedByCsrId}`;
      if (!buckets.has(key)) buckets.set(key, { date, clinicId: appointment.clinicId, csrId: appointment.bookedByCsrId, calls: [], appointments: 0 });
      buckets.get(key).appointments += 1;
    }

    for (const bucket of buckets.values()) {
      try {
        const totalCalls = bucket.calls.length;
        const answeredCalls = bucket.calls.filter((call) => call.answered).length;
        const conversations = bucket.calls.filter((call) => call.conversation).length;
        const firstCallAt = bucket.calls[0]?.startedAt || null;
        const lastCall = bucket.calls[bucket.calls.length - 1];
        const lastCallAt = lastCall?.endedAt || lastCall?.startedAt || null;
        let gapTimeSeconds = 0;
        for (let index = 1; index < bucket.calls.length; index += 1) {
          const previousEnd = bucket.calls[index - 1].endedAt || bucket.calls[index - 1].startedAt;
          const gap = (bucket.calls[index].startedAt - previousEnd) / 1000;
          if (gap > 0) gapTimeSeconds += gap;
        }
        const values = {
          date: bucket.date,
          clinicId: bucket.clinicId,
          csrId: bucket.csrId,
          inboundCalls: bucket.calls.filter((call) => call.direction === 'inbound').length,
          outboundCalls: bucket.calls.filter((call) => call.direction === 'outbound').length,
          answeredCalls,
          conversations,
          appointments: bucket.appointments,
          talkTimeSeconds: bucket.calls.reduce((sum, call) => sum + (call.talkTimeSeconds || 0), 0),
          gapTimeSeconds: Math.round(gapTimeSeconds),
          firstCallAt,
          lastCallAt,
          workingTimeSeconds: firstCallAt && lastCallAt ? Math.max(0, Math.round((lastCallAt - firstCallAt) / 1000)) : 0,
          answerRate: totalCalls ? (answeredCalls / totalCalls) * 100 : 0,
          conversionRate: conversations ? (bucket.appointments / conversations) * 100 : 0,
          rawData: { source: 'local_recalculation', callCount: totalCalls },
          syncedAt: new Date(),
        };
        const filter = { date: bucket.date, clinicId: bucket.clinicId, csrId: bucket.csrId };
        const existingMetric = await DailyAgentMetric.findOne(filter).select('rawData').lean();
        if (existingMetric && existingMetric.rawData?.source !== 'local_recalculation') {
          continue;
        }
        await upsert(
          DailyAgentMetric,
          filter,
          values,
          counters
        );
      } catch (error) {
        recordError(counters, error, { entity: 'recalculated_metric' });
      }
    }
  });
}

module.exports = {
  syncRecent,
  syncRange,
  syncPreviousSevenDays,
  syncAgentMetrics,
  recalculateDailyMetrics,
};
