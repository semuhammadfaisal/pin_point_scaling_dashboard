const SourceSnapshotV2 = require('../models/SourceSnapshotV2');
const SyncCheckpointV2 = require('../models/SyncCheckpointV2');
const CanonicalCallV2 = require('../models/CanonicalCallV2');
const CanonicalLeadV2 = require('../models/CanonicalLeadV2');
const CanonicalAppointmentV2 = require('../models/CanonicalAppointmentV2');
const CanonicalAgentV2 = require('../models/CanonicalAgentV2');
const DailyMetricV2 = require('../models/DailyMetricV2');
const ClinicSourceMappingV2 = require('../models/ClinicSourceMappingV2');
const hotProspectorApi = require('./hotProspectorApiService');
const hotProspectorOverview = require('./hotProspectorOverviewService');
const mappingService = require('./v2MappingService');
const quality = require('./v2QualityService');
const normalizer = require('./v2Normalizer');
const payloadService = require('./v2PayloadService');
const env = require('../config/env');
const { localDateRange } = require('../utils/date');

function isoDay(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('A valid YYYY-MM-DD date is required.');
  return date.toISOString().slice(0, 10);
}

function addDays(day, count) {
  const date = new Date(`${isoDay(day)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return isoDay(date);
}

async function storeSnapshot({ endpointKey, filters, rawPayload, recordCount, expectedRecordCount, complete, metadata = {}, sourceAsOf = new Date() }) {
  const requestFingerprint = payloadService.requestFingerprint(endpointKey, filters);
  const responseHash = payloadService.hash(rawPayload);
  const sanitizedPayload = payloadService.sanitize(rawPayload);
  return SourceSnapshotV2.create({
    endpointKey,
    requestFingerprint,
    responseHash,
    filters,
    sourceAsOf,
    fetchedAt: new Date(),
    normalizationVersion: normalizer.VERSION,
    recordCount,
    expectedRecordCount,
    complete,
    sanitized: true,
    payload: sanitizedPayload,
    metadata,
  });
}

async function captureOverview(day) {
  const filters = { startDate: isoDay(day), endDate: isoDay(day), campaignId: null };
  const overview = await hotProspectorOverview.getOverviewMetrics(filters);
  const snapshot = await storeSnapshot({
    endpointKey: 'webOverview',
    filters,
    rawPayload: overview.rawData,
    recordCount: 1,
    expectedRecordCount: 1,
    complete: true,
  });
  await DailyMetricV2.findOneAndUpdate(
    { date: filters.startDate, scopeType: 'agency', scopeKey: 'agency' },
    {
      $set: {
        timezone: env.cron.timezone,
        newLeads: overview.newLeads,
        outboundDials: overview.outboundDials,
        answeredCalls: overview.answeredCalls,
        decisionMakers: overview.decisionMakers,
        conversations: null,
        validBookings: overview.validBookings,
        talkTimeSeconds: null,
        gapTimeSeconds: null,
        workingTimeSeconds: null,
        uniqueLeadsDialed: 0,
        speedToLeadTotalSeconds: overview.averageSpeedToLeadSeconds * overview.newLeads,
        speedToLeadSampleSize: overview.newLeads,
        source: 'hot_prospector',
        sourceAsOf: snapshot.sourceAsOf,
        sourceSnapshotId: snapshot._id,
        certification: 'unverified',
        qualityIssues: ['Detailed records and clinic mappings must reconcile before certification.'],
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
  return snapshot;
}

async function captureCalls(day) {
  const filters = { fromDate: isoDay(day), toDate: isoDay(day) };
  const result = await hotProspectorApi.fetchPaginatedWithMeta('userCallLogs', {
    from_date: filters.fromDate,
    to_date: filters.toDate,
    campaignId: '',
    groupId: '',
    memberId: '',
    sort_by: 'call_time',
    sort_order: 'ASC',
  });
  const snapshot = await storeSnapshot({
    endpointKey: 'userCallLogs',
    filters,
    rawPayload: result.records,
    recordCount: result.records.length,
    expectedRecordCount: result.expectedRecordCount,
    complete: result.complete,
    metadata: result.metadata,
  });
  if (!result.complete) {
    await quality.report('incomplete_pagination', 'Hot Prospector returned an incomplete call-log page set.', {
      severity: 'critical', discriminator: filters.fromDate, details: result.metadata,
    });
    return { snapshot, canonicalCount: 0, quarantinedCount: result.records.length };
  }

  const mappingIndex = await mappingService.mappingIndex();
  const operations = [];
  const leadById = new Map();
  let leadsWithoutCreatedDate = 0;
  const reportedMappings = new Set();
  let quarantinedCount = 0;
  for (const record of result.records) {
    const mapping = await mappingService.resolveRecord(record, mappingIndex, reportedMappings);
    if (!mapping) {
      quarantinedCount += 1;
      continue;
    }
    const call = normalizer.normalizeCall(record, mapping, snapshot._id, {
      answerThresholdSeconds: env.metrics.answerThresholdSeconds,
      answerThresholdVerified: env.metrics.answerThresholdVerified,
    });
    const errors = normalizer.validateCall(call);
    if (errors.length) {
      quarantinedCount += 1;
      await quality.report('invalid_call', `Call could not be normalized: ${errors.join(', ')}.`, {
        severity: 'critical', entityType: 'call', externalId: call.externalCallId,
        clinicId: mapping.clinicId, details: { errors, date: filters.fromDate },
      });
      continue;
    }
    operations.push({
      updateOne: {
        filter: { externalCallId: call.externalCallId },
        update: { $set: call },
        upsert: true,
      },
    });
    const lead = normalizer.normalizeLead(record, mapping, snapshot._id);
    if (lead.externalLeadId && lead.createdAtExternal) leadById.set(lead.externalLeadId, lead);
    else if (lead.externalLeadId) leadsWithoutCreatedDate += 1;
  }
  for (let offset = 0; offset < operations.length; offset += 500) {
    await CanonicalCallV2.bulkWrite(operations.slice(offset, offset + 500), { ordered: false });
  }
  const leadOperations = [...leadById.values()].map((lead) => ({
    updateOne: { filter: { externalLeadId: lead.externalLeadId }, update: { $set: lead }, upsert: true },
  }));
  for (let offset = 0; offset < leadOperations.length; offset += 500) {
    await CanonicalLeadV2.bulkWrite(leadOperations.slice(offset, offset + 500), { ordered: false });
  }
  if (leadsWithoutCreatedDate) {
    await quality.report('missing_lead_created_at', `${leadsWithoutCreatedDate} call records contain a lead ID but no explicit lead creation time.`, {
      severity: 'critical', discriminator: filters.fromDate, details: { date: filters.fromDate, count: leadsWithoutCreatedDate },
    });
  }
  return { snapshot, canonicalCount: operations.length, quarantinedCount };
}

async function captureAgents(day) {
  const records = await hotProspectorApi.fetchUsers();
  const snapshot = await storeSnapshot({
    endpointKey: 'users', filters: { date: isoDay(day) }, rawPayload: records,
    recordCount: records.length, expectedRecordCount: records.length, complete: true,
  });
  const operations = [];
  for (const record of records) {
    const agent = normalizer.normalizeAgent(record, snapshot._id);
    if (!agent.externalUserId || !agent.name) {
      await quality.report('invalid_agent', 'An agent record is missing a stable ID or name.', {
        severity: 'critical', entityType: 'agent', externalId: agent.externalUserId,
        discriminator: agent.sourceHash,
      });
      continue;
    }
    operations.push({ updateOne: { filter: { externalUserId: agent.externalUserId }, update: { $set: agent }, upsert: true } });
  }
  if (operations.length) await CanonicalAgentV2.bulkWrite(operations, { ordered: false });
  return snapshot;
}

async function captureAppointments(day) {
  const filters = { fromDate: isoDay(day), toDate: isoDay(day) };
  let result;
  try {
    result = await hotProspectorApi.fetchPaginatedWithMeta('appointments', {
      from_date: filters.fromDate, to_date: filters.toDate, campaignId: '', groupId: '',
    });
  } catch (error) {
    await quality.report('appointments_endpoint_unavailable', `Appointments could not be fetched: ${error.message}`, {
      severity: 'critical', discriminator: 'appointments_endpoint', details: { status: error.response?.status || null },
    });
    return { available: false, error: error.message };
  }
  const snapshot = await storeSnapshot({
    endpointKey: 'appointments', filters, rawPayload: result.records, recordCount: result.records.length,
    expectedRecordCount: result.expectedRecordCount, complete: result.complete, metadata: result.metadata,
  });
  if (!result.complete) {
    await quality.report('incomplete_appointment_pagination', 'Hot Prospector returned incomplete appointment pages.', {
      severity: 'critical', discriminator: filters.fromDate, details: result.metadata,
    });
    return { available: true, snapshot, canonicalCount: 0 };
  }
  const mappingIndex = await mappingService.mappingIndex();
  const operations = [];
  const reportedMappings = new Set();
  for (const record of result.records) {
    const mapping = await mappingService.resolveRecord(record, mappingIndex, reportedMappings);
    if (!mapping) continue;
    const appointment = normalizer.normalizeAppointment(record, mapping, snapshot._id);
    if (!appointment.externalAppointmentId || !appointment.appointmentDate || !appointment.status) {
      await quality.report('invalid_appointment', 'An appointment is missing its ID, date, or status.', {
        severity: 'critical', entityType: 'appointment', externalId: appointment.externalAppointmentId,
        clinicId: mapping.clinicId, discriminator: appointment.sourceHash,
      });
      continue;
    }
    operations.push({
      updateOne: { filter: { externalAppointmentId: appointment.externalAppointmentId }, update: { $set: appointment }, upsert: true },
    });
  }
  if (operations.length) await CanonicalAppointmentV2.bulkWrite(operations, { ordered: false });
  return { available: true, snapshot, canonicalCount: operations.length };
}

async function materializeClinicDay(day) {
  const mappings = await ClinicSourceMappingV2.find({ mappingVerified: true, timezoneVerified: true }).lean();
  for (const mapping of mappings) {
    const { start, end } = localDateRange(isoDay(day), isoDay(day), mapping.timezone);
    const [rows, leadRows, bookingRows, appointmentSnapshot] = await Promise.all([CanonicalCallV2.aggregate([
      { $match: { clinicId: mapping.clinicId, startedAt: { $gte: start, $lt: end }, supersededAt: null } },
      {
        $group: {
          _id: null,
          outboundDials: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
          answeredKnown: { $sum: { $cond: [{ $ne: ['$answered', null] }, 1, 0] } },
          answeredCalls: { $sum: { $cond: [{ $eq: ['$answered', true] }, 1, 0] } },
          conversationKnown: { $sum: { $cond: [{ $ne: ['$conversation', null] }, 1, 0] } },
          conversations: { $sum: { $cond: [{ $eq: ['$conversation', true] }, 1, 0] } },
          talkKnown: { $sum: { $cond: [{ $ne: ['$talkTimeSeconds', null] }, 1, 0] } },
          talkTimeSeconds: { $sum: { $ifNull: ['$talkTimeSeconds', 0] } },
          uniqueLeads: { $addToSet: '$externalLeadId' },
          sourceAsOf: { $max: '$updatedAt' },
          snapshotId: { $last: '$sourceSnapshotId' },
        },
      },
    ]), CanonicalLeadV2.aggregate([
      { $match: { clinicId: mapping.clinicId, createdAtExternal: { $gte: start, $lt: end }, supersededAt: null } },
      {
        $group: {
          _id: null, newLeads: { $sum: 1 },
          speedTotal: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$firstDialAt', null] }, { $gte: ['$firstDialAt', '$createdAtExternal'] }] },
                { $dateDiff: { startDate: '$createdAtExternal', endDate: '$firstDialAt', unit: 'second' } }, 0,
              ],
            },
          },
          speedSamples: {
            $sum: { $cond: [{ $and: [{ $ne: ['$firstDialAt', null] }, { $gte: ['$firstDialAt', '$createdAtExternal'] }] }, 1, 0] },
          },
        },
      },
    ]), CanonicalAppointmentV2.aggregate([
      {
        $match: {
          clinicId: mapping.clinicId, appointmentDate: { $gte: start, $lt: end }, supersededAt: null,
          status: { $in: env.metrics.validBookingStatuses, $nin: env.metrics.excludedBookingStatuses },
        },
      },
      { $count: 'validBookings' },
    ]), SourceSnapshotV2.findOne({ endpointKey: 'appointments', 'filters.fromDate': isoDay(day), complete: true }).lean()]);
    const row = rows[0];
    if (!row) continue;
    const leadRow = leadRows[0] || {};
    const bookingRow = bookingRows[0] || {};
    const qualityIssues = [];
    if (!env.metrics.answerThresholdVerified) qualityIssues.push('Answered-call rule has not been verified against the source contract.');
    if (!row.conversationKnown) qualityIssues.push('No verified conversation field is available.');
    if (!row.talkKnown) qualityIssues.push('No explicit talk-time field is available.');
    if (!appointmentSnapshot) qualityIssues.push('The appointment endpoint is unavailable or incomplete.');
    await DailyMetricV2.findOneAndUpdate(
      { date: isoDay(day), scopeType: 'clinic', scopeKey: String(mapping.clinicId) },
      {
        $set: {
          clinicId: mapping.clinicId,
          timezone: mapping.timezone,
          newLeads: leadRow.newLeads || 0,
          outboundDials: row.outboundDials,
          answeredCalls: row.answeredKnown ? row.answeredCalls : null,
          decisionMakers: null,
          conversations: row.conversationKnown ? row.conversations : null,
          validBookings: appointmentSnapshot ? (bookingRow.validBookings || 0) : null,
          talkTimeSeconds: row.talkKnown ? row.talkTimeSeconds : null,
          gapTimeSeconds: null,
          workingTimeSeconds: null,
          uniqueLeadsDialed: row.uniqueLeads.filter(Boolean).length,
          speedToLeadTotalSeconds: leadRow.speedTotal || 0,
          speedToLeadSampleSize: leadRow.speedSamples || 0,
          source: 'canonical_v2',
          sourceAsOf: row.sourceAsOf || new Date(),
          sourceSnapshotId: row.snapshotId,
          certification: qualityIssues.length ? 'unverified' : 'certified',
          qualityIssues,
        },
      },
      { upsert: true, runValidators: true }
    );
  }
}

async function syncDay(day) {
  const checkpointKey = `day:${isoDay(day)}`;
  await SyncCheckpointV2.findOneAndUpdate(
    { checkpointKey },
    { $set: { endpointKey: 'daily_bundle', status: 'running', rangeStart: new Date(`${isoDay(day)}T00:00:00Z`), lastAttemptAt: new Date(), lastError: '' } },
    { upsert: true, runValidators: true }
  );
  try {
    const overviewSnapshot = await captureOverview(day);
    const agentSnapshot = await captureAgents(day);
    const callResult = await captureCalls(day);
    const appointmentResult = await captureAppointments(day);
    await materializeClinicDay(day);
    await SyncCheckpointV2.updateOne(
      { checkpointKey },
      {
        $set: {
          status: 'complete', completedAt: new Date(), recordsFetched: callResult.snapshot.recordCount,
          expectedRecords: callResult.snapshot.expectedRecordCount,
          metadata: {
            overviewSnapshotId: overviewSnapshot._id, agentSnapshotId: agentSnapshot._id,
            callSnapshotId: callResult.snapshot._id, appointmentSnapshotId: appointmentResult.snapshot?._id || null,
            appointmentsAvailable: appointmentResult.available, quarantined: callResult.quarantinedCount,
          },
        },
      }
    );
    return { overviewSnapshot, ...callResult };
  } catch (error) {
    await SyncCheckpointV2.updateOne({ checkpointKey }, { $set: { status: 'failed', lastError: error.message, lastAttemptAt: new Date() } });
    await quality.report('sync_failure', `V2 synchronization failed for ${isoDay(day)}: ${error.message}`, {
      severity: 'critical', discriminator: isoDay(day), details: { code: error.code || null },
    });
    throw error;
  }
}

async function syncRecent() {
  const today = isoDay(new Date());
  return Promise.all([syncDay(addDays(today, -1)), syncDay(today)]);
}

async function backfill(startDate, endDate = isoDay(new Date())) {
  let day = isoDay(startDate || env.metrics.v2BackfillStartDate);
  const last = isoDay(endDate);
  const results = [];
  while (day <= last) {
    const checkpoint = await SyncCheckpointV2.findOne({ checkpointKey: `day:${day}`, status: 'complete' }).lean();
    if (!checkpoint) results.push(await syncDay(day));
    day = addDays(day, 1);
  }
  return results;
}

module.exports = {
  isoDay, addDays, storeSnapshot, captureOverview, captureCalls, captureAgents, captureAppointments,
  materializeClinicDay, syncDay, syncRecent, backfill,
};
