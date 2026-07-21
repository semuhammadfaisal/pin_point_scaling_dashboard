const mongoose = require('mongoose');
const Clinic = require('../models/Clinic');
const CSR = require('../models/CSR');
const Lead = require('../models/Lead');
const Call = require('../models/Call');
const Appointment = require('../models/Appointment');
const DailyAgentMetric = require('../models/DailyAgentMetric');
const DailyClinicMetric = require('../models/DailyClinicMetric');
const SyncLog = require('../models/SyncLog');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { parseExternalDate, formatApiDate } = require('../utils/date');
const { percentage, average, median, round } = require('./metricsFormulaService');
const hotProspectorOverview = require('./hotProspectorOverviewService');
const hotProspectorAgentMetrics = require('./hotProspectorAgentMetricsService');

const resultCache = new Map();

function cacheKey(namespace, filters, extra = {}) {
  return `${namespace}:${JSON.stringify({
    startDate: filters.startDate,
    endDate: filters.endDate,
    clinicId: filters.clinicId || null,
    csrId: filters.csrId || null,
    campaignId: filters.campaignId || null,
    groupId: filters.groupId || null,
    period: filters.period || null,
    search: filters.search || '',
    ...extra,
  })}`;
}

function cached(key, loader) {
  const now = Date.now();
  const existing = resultCache.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;
  for (const [entryKey, entry] of resultCache) {
    if (entry.expiresAt <= now) resultCache.delete(entryKey);
  }
  const record = {
    expiresAt: now + env.metrics.cacheTtlMs,
    promise: Promise.resolve().then(loader),
  };
  resultCache.set(key, record);
  record.promise.catch(() => {
    if (resultCache.get(key) === record) resultCache.delete(key);
  });
  return record.promise;
}

const objectId = (value) => new mongoose.Types.ObjectId(value);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nextDateString(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function clinicDateRange(filters, clinic) {
  return {
    start: parseExternalDate(`${filters.startDate} 00:00:00`, clinic.timezone),
    endExclusive: parseExternalDate(`${nextDateString(filters.endDate)} 00:00:00`, clinic.timezone),
  };
}

function metricDateRange(filters) {
  return {
    start: new Date(`${filters.startDate}T00:00:00.000Z`),
    endExclusive: new Date(`${nextDateString(filters.endDate)}T00:00:00.000Z`),
  };
}

function leadMatch(filters, clinic, range) {
  const match = { clinicId: clinic._id, createdAtExternal: { $gte: range.start, $lt: range.endExclusive } };
  if (filters.csrId) match.assignedCsrId = objectId(filters.csrId);
  if (filters.campaignId) match.campaignId = filters.campaignId;
  if (filters.groupId) match.groupId = filters.groupId;
  return match;
}

function callMatch(filters, clinic, range) {
  const match = { clinicId: clinic._id, startedAt: { $gte: range.start, $lt: range.endExclusive } };
  if (filters.csrId) match.csrId = objectId(filters.csrId);
  if (filters.campaignId) match.campaignId = filters.campaignId;
  return match;
}

function appointmentMatch(filters, clinic, range) {
  const match = {
    clinicId: clinic._id,
    appointmentDate: { $gte: range.start, $lt: range.endExclusive },
    status: { $in: env.metrics.validBookingStatuses.map((status) => new RegExp(`^${escapeRegex(status)}$`, 'i')) },
  };
  if (env.metrics.excludedBookingStatuses.length) {
    match.status.$nin = env.metrics.excludedBookingStatuses.map((status) => new RegExp(`^${escapeRegex(status)}$`, 'i'));
  }
  if (filters.csrId) match.bookedByCsrId = objectId(filters.csrId);
  if (filters.campaignId) match.campaignId = filters.campaignId;
  return match;
}

async function getClinicScope(filters, options = {}) {
  const match = { reportingVisible: { $ne: false } };
  if (filters.clinicId) match._id = objectId(filters.clinicId);
  if (options.search) {
    const search = new RegExp(escapeRegex(options.search), 'i');
    match.$or = [{ name: search }, { slug: search }];
  }
  return Clinic.find(match).sort({ name: 1 }).lean();
}

async function aggregateCallStats(filters, clinic, range) {
  const [result] = await Call.aggregate([
    { $match: callMatch(filters, clinic, range) },
    {
      $group: {
        _id: '$externalCallId',
        leadId: { $first: '$leadId' },
        direction: { $first: '$direction' },
        answered: { $first: '$answered' },
        conversation: { $first: '$conversation' },
        talkTimeSeconds: { $first: '$talkTimeSeconds' },
      },
    },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: 1 },
        outboundDials: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
        answeredOutboundCalls: {
          $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'outbound'] }, '$answered'] }, 1, 0] },
        },
        answeredCalls: { $sum: { $cond: ['$answered', 1, 0] } },
        answeredKnown: { $sum: { $cond: [{ $ne: ['$answered', null] }, 1, 0] } },
        conversations: { $sum: { $cond: ['$conversation', 1, 0] } },
        conversationKnown: { $sum: { $cond: [{ $ne: ['$conversation', null] }, 1, 0] } },
        talkTimeSeconds: { $sum: { $ifNull: ['$talkTimeSeconds', 0] } },
        talkTimeKnown: { $sum: { $cond: [{ $ne: ['$talkTimeSeconds', null] }, 1, 0] } },
        outboundLeadIds: {
          $addToSet: { $cond: [{ $eq: ['$direction', 'outbound'] }, '$leadId', null] },
        },
      },
    },
  ]);
  const uniqueLeadsDialed = (result?.outboundLeadIds || []).filter(Boolean).length;
  return {
    totalCalls: result?.totalCalls || 0,
    outboundDials: result?.outboundDials || 0,
    answeredOutboundCalls: result?.answeredKnown ? result.answeredOutboundCalls : null,
    answeredCalls: result?.answeredKnown ? result.answeredCalls : null,
    conversations: result?.conversationKnown ? result.conversations : null,
    talkTimeSeconds: result?.talkTimeKnown ? result.talkTimeSeconds : null,
    uniqueLeadsDialed,
  };
}

async function aggregateSpeedToLead(filters, clinic, range) {
  const speedLeadMatch = leadMatch({ ...filters, csrId: null }, clinic, range);
  const callConditions = [
    { $eq: ['$leadId', '$$localLeadId'] },
    { $eq: ['$direction', 'outbound'] },
    { $gte: ['$startedAt', '$$createdAt'] },
  ];
  if (filters.csrId) callConditions.push({ $eq: ['$csrId', objectId(filters.csrId)] });
  const rows = await Lead.aggregate([
    { $match: speedLeadMatch },
    { $group: { _id: '$externalLeadId', leadId: { $first: '$_id' }, createdAtExternal: { $first: '$createdAtExternal' } } },
    {
      $lookup: {
        from: Call.collection.name,
        let: { localLeadId: '$leadId', createdAt: '$createdAtExternal' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: callConditions,
              },
            },
          },
          { $group: { _id: '$externalCallId', startedAt: { $min: '$startedAt' } } },
          { $sort: { startedAt: 1 } },
          { $limit: 1 },
        ],
        as: 'firstDial',
      },
    },
    { $match: { 'firstDial.0': { $exists: true } } },
    {
      $project: {
        _id: 0,
        seconds: { $divide: [{ $subtract: [{ $arrayElemAt: ['$firstDial.startedAt', 0] }, '$createdAtExternal'] }, 1000] },
      },
    },
    { $match: { seconds: { $gte: 0 } } },
    { $sort: { seconds: 1 } },
  ]);
  return rows.map((row) => row.seconds).filter(Number.isFinite);
}

async function calculateClinicMetrics(filters, clinic) {
  const range = clinicDateRange(filters, clinic);
  const dailyRange = metricDateRange(filters);
  const [leadRows, appointmentRows, callStats, speedValues, agentTimeRows, hasAppointmentData] = await Promise.all([
    Lead.aggregate([
      { $match: leadMatch(filters, clinic, range) },
      { $group: { _id: '$externalLeadId' } },
      { $count: 'count' },
    ]),
    Appointment.aggregate([
      { $match: appointmentMatch(filters, clinic, range) },
      { $group: { _id: '$externalAppointmentId' } },
      { $count: 'count' },
    ]),
    aggregateCallStats(filters, clinic, range),
    aggregateSpeedToLead(filters, clinic, range),
    DailyAgentMetric.aggregate([
      {
        $match: {
          clinicId: clinic._id,
          date: { $gte: dailyRange.start, $lt: dailyRange.endExclusive },
          'rawData.source': { $ne: 'local_recalculation' },
          ...(filters.csrId ? { csrId: objectId(filters.csrId) } : {}),
        },
      },
      {
        $group: {
          _id: null,
          workingTimeSeconds: { $sum: '$workingTimeSeconds' },
          gapTimeSeconds: { $sum: '$gapTimeSeconds' },
          outboundCalls: { $sum: '$outboundCalls' },
          answeredCalls: { $sum: '$answeredCalls' },
          conversations: { $sum: '$conversations' },
          appointments: { $sum: '$appointments' },
          talkTimeSeconds: { $sum: '$talkTimeSeconds' },
        },
      },
    ]),
    Appointment.exists({}),
  ]);

  const newLeads = leadRows[0]?.count || 0;
  const validBookings = hasAppointmentData ? (appointmentRows[0]?.count || 0) : null;
  const conversations = callStats.conversations;
  const answeredCalls = callStats.answeredCalls;
  const answeredOutboundCalls = callStats.answeredOutboundCalls;
  const answerRateDials = callStats.outboundDials;
  const talkTimeSeconds = callStats.talkTimeSeconds;
  const workingTimeSeconds = agentTimeRows[0] ? agentTimeRows[0].workingTimeSeconds : null;
  const totalGapTimeSeconds = agentTimeRows[0] ? agentTimeRows[0].gapTimeSeconds : null;
  const speedTotal = speedValues.reduce((sum, value) => sum + value, 0);

  return {
    clinicId: String(clinic._id),
    name: clinic.name,
    timezone: clinic.timezone,
    campaignId: clinic.hotProspectorCampaignId || null,
    groupId: clinic.hotProspectorGroupId || null,
    newLeads,
    validBookings,
    ...callStats,
    answeredCalls,
    answeredOutboundCalls,
    conversations,
    talkTimeSeconds,
    totalGapTimeSeconds,
    workingTimeSeconds,
    leadToBookingRate: percentage(validBookings, newLeads),
    conversationToBookingRate: percentage(validBookings, conversations),
    bookingRatio: percentage(validBookings, conversations),
    dialsPerLead: average(callStats.outboundDials, callStats.uniqueLeadsDialed),
    averageDialsPerLead: average(callStats.outboundDials, callStats.uniqueLeadsDialed),
    averageSpeedToLeadSeconds: average(speedTotal, speedValues.length),
    medianSpeedToLeadSeconds: median(speedValues),
    contactedWithin1Minute: percentage(speedValues.filter((value) => value <= 60).length, speedValues.length),
    contactedWithin5Minutes: percentage(speedValues.filter((value) => value <= 300).length, speedValues.length),
    contactedWithin15Minutes: percentage(speedValues.filter((value) => value <= 900).length, speedValues.length),
    answerRate: percentage(answeredOutboundCalls, answerRateDials),
    conversationRate: percentage(conversations, answeredCalls),
    talkTimeUtilization: percentage(talkTimeSeconds, workingTimeSeconds),
    averageTalkTimePerConversation: average(talkTimeSeconds, conversations),
    speedSampleSize: speedValues.length,
    _speedValues: speedValues,
    _answerRateDials: answerRateDials,
  };
}

async function getClinicMetricRows(filters, options = {}) {
  const search = options.search || '';
  return cached(cacheKey('clinic-metrics', { ...filters, search }, { search }), async () => {
    const clinics = await getClinicScope(filters, { search });
    return Promise.all(clinics.map((clinic) => calculateClinicMetrics(filters, clinic)));
  });
}

function combineMetrics(rows) {
  const totals = rows.reduce(
    (sum, row) => {
      for (const key of [
        'newLeads', 'validBookings', 'totalCalls', 'outboundDials', 'answeredOutboundCalls', 'answeredCalls',
        'conversations', 'talkTimeSeconds', 'uniqueLeadsDialed', 'totalGapTimeSeconds', 'workingTimeSeconds',
      ]) sum[key] += row[key] || 0;
      sum.speedValues.push(...(row._speedValues || []));
      sum.answerRateDials += row._answerRateDials || row.outboundDials || 0;
      return sum;
    },
    {
      newLeads: 0, validBookings: 0, totalCalls: 0, outboundDials: 0, answeredOutboundCalls: 0,
      answeredCalls: 0, conversations: 0, talkTimeSeconds: 0, uniqueLeadsDialed: 0,
      totalGapTimeSeconds: 0, workingTimeSeconds: 0, speedValues: [], answerRateDials: 0,
    }
  );
  const speedTotal = totals.speedValues.reduce((sum, value) => sum + value, 0);
  return {
    newLeads: totals.newLeads,
    validBookings: totals.validBookings,
    outboundDials: totals.outboundDials,
    answeredOutboundCalls: totals.answeredOutboundCalls,
    answeredCalls: totals.answeredCalls,
    conversations: totals.conversations,
    uniqueLeadsDialed: totals.uniqueLeadsDialed,
    totalGapTimeSeconds: totals.totalGapTimeSeconds,
    talkTimeSeconds: totals.talkTimeSeconds,
    workingTimeSeconds: totals.workingTimeSeconds,
    leadToBookingRate: percentage(totals.validBookings, totals.newLeads),
    conversationToBookingRate: percentage(totals.validBookings, totals.conversations),
    dialsPerLead: average(totals.outboundDials, totals.uniqueLeadsDialed),
    averageDialsPerLead: average(totals.outboundDials, totals.uniqueLeadsDialed),
    averageSpeedToLeadSeconds: average(speedTotal, totals.speedValues.length),
    medianSpeedToLeadSeconds: median(totals.speedValues),
    contactedWithin1Minute: percentage(totals.speedValues.filter((value) => value <= 60).length, totals.speedValues.length),
    contactedWithin5Minutes: percentage(totals.speedValues.filter((value) => value <= 300).length, totals.speedValues.length),
    contactedWithin15Minutes: percentage(totals.speedValues.filter((value) => value <= 900).length, totals.speedValues.length),
    answerRate: percentage(totals.answeredOutboundCalls, totals.answerRateDials),
    conversationRate: percentage(totals.conversations, totals.answeredCalls),
    talkTimeUtilization: percentage(totals.talkTimeSeconds, totals.workingTimeSeconds),
    averageTalkTimePerConversation: average(totals.talkTimeSeconds, totals.conversations),
    speedSampleSize: totals.speedValues.length,
  };
}

function publicMetric(row) {
  const { _speedValues, _answerRateDials, ...result } = row;
  return result;
}

function sortRows(rows, filters) {
  const direction = filters.sortOrder === 'desc' ? -1 : 1;
  return rows.sort((first, second) => {
    const firstValue = first[filters.sortBy] ?? 0;
    const secondValue = second[filters.sortBy] ?? 0;
    if (typeof firstValue === 'string') return firstValue.localeCompare(String(secondValue)) * direction;
    return (Number(firstValue) - Number(secondValue)) * direction;
  });
}

function paginate(rows, filters) {
  const start = (filters.page - 1) * filters.limit;
  return {
    data: rows.slice(start, start + filters.limit),
    pagination: { page: filters.page, limit: filters.limit, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / filters.limit)) },
  };
}

function bucketExpression(field, period, timezone) {
  if (period === 'monthly') return { $dateToString: { date: `$${field}`, format: '%Y-%m', timezone } };
  if (period === 'weekly') {
    return {
      $dateToString: {
        date: { $dateTrunc: { date: `$${field}`, unit: 'week', timezone, startOfWeek: 'monday' } },
        format: '%Y-%m-%d',
        timezone,
      },
    };
  }
  return { $dateToString: { date: `$${field}`, format: '%Y-%m-%d', timezone } };
}

async function getClinicTrends(filters, clinic) {
  const range = clinicDateRange(filters, clinic);
  const [leads, calls, bookings] = await Promise.all([
    Lead.aggregate([
      { $match: leadMatch(filters, clinic, range) },
      { $group: { _id: '$externalLeadId', date: { $first: '$createdAtExternal' } } },
      { $group: { _id: bucketExpression('date', filters.period, clinic.timezone), newLeads: { $sum: 1 } } },
    ]),
    Call.aggregate([
      { $match: callMatch(filters, clinic, range) },
      {
        $group: {
          _id: '$externalCallId',
          date: { $first: '$startedAt' }, direction: { $first: '$direction' }, answered: { $first: '$answered' },
          conversation: { $first: '$conversation' }, csrId: { $first: '$csrId' },
        },
      },
      {
        $group: {
          _id: bucketExpression('date', filters.period, clinic.timezone),
          outboundDials: { $sum: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
          answeredCalls: { $sum: { $cond: ['$answered', 1, 0] } },
          conversations: { $sum: { $cond: ['$conversation', 1, 0] } },
        },
      },
    ]),
    Appointment.aggregate([
      { $match: appointmentMatch(filters, clinic, range) },
      { $group: { _id: '$externalAppointmentId', date: { $first: '$appointmentDate' } } },
      { $group: { _id: bucketExpression('date', filters.period, clinic.timezone), validBookings: { $sum: 1 } } },
    ]),
  ]);
  const buckets = new Map();
  const merge = (row) => buckets.set(row._id, { ...(buckets.get(row._id) || {}), ...row });
  [...leads, ...calls, ...bookings].forEach(merge);
  return [...buckets.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([period, row]) => ({
    period,
    clinicId: String(clinic._id),
    clinicName: clinic.name,
    newLeads: row.newLeads || 0,
    validBookings: row.validBookings || 0,
    outboundDials: row.outboundDials || 0,
    answeredCalls: row.answeredCalls || 0,
    conversations: row.conversations || 0,
    leadToBookingRate: percentage(row.validBookings || 0, row.newLeads || 0),
    conversationToBookingRate: percentage(row.validBookings || 0, row.conversations || 0),
  }));
}

async function buildOverview(filters) {
  if (env.hotProspector.webCookie && !filters.clinicId && !filters.csrId && !filters.groupId) {
    const authoritative = await hotProspectorOverview.getOverviewMetrics(filters);
    return {
      summary: {
        newLeads: authoritative.newLeads,
        outboundDials: authoritative.outboundDials,
        validBookings: authoritative.validBookings,
        answeredCalls: authoritative.answeredCalls,
        answeredOutboundCalls: authoritative.answeredCalls,
        decisionMakers: authoritative.decisionMakers,
        conversations: null,
        averageSpeedToLeadSeconds: authoritative.averageSpeedToLeadSeconds,
        dialsPerLead: authoritative.averageDialsPerLead,
        averageDialsPerLead: authoritative.averageDialsPerLead,
        leadToBookingRate: percentage(authoritative.validBookings, authoritative.newLeads),
        appointmentToAnswerRate: percentage(authoritative.validBookings, authoritative.answeredCalls),
        answerRate: percentage(authoritative.answeredCalls, authoritative.outboundDials),
        conversationToBookingRate: null,
        conversationRate: null,
        talkTimeSeconds: null,
        totalGapTimeSeconds: null,
        workingTimeSeconds: null,
        talkTimeUtilization: null,
        averageTalkTimePerConversation: null,
        medianSpeedToLeadSeconds: null,
        contactedWithin1Minute: null,
        contactedWithin5Minutes: null,
        contactedWithin15Minutes: null,
        uniqueLeadsDialed: null,
        speedSampleSize: null,
        source: 'hot_prospector_overview',
        sourceAsOf: authoritative.fetchedAt,
      },
      data: [],
    };
  }
  const rows = await getClinicMetricRows(filters);
  const summary = combineMetrics(rows);
  return { summary, data: rows.map(publicMetric) };
}

async function getOverview(filters) {
  if (env.hotProspector.webCookie && !filters.clinicId && !filters.csrId && !filters.groupId) {
    return buildOverview(filters);
  }
  return cached(cacheKey('overview', filters), () => buildOverview(filters));
}

async function buildTrends(filters) {
  const clinics = await getClinicScope(filters);
  const clinicRows = (await Promise.all(clinics.map((clinic) => getClinicTrends(filters, clinic)))).flat()
    .map((row) => ({ scope: 'clinic', ...row }));
  const agencyBuckets = new Map();
  for (const row of clinicRows) {
    const current = agencyBuckets.get(row.period) || {
      scope: 'agency', period: row.period, clinicId: null, clinicName: 'All clinics',
      newLeads: 0, validBookings: 0, outboundDials: 0, answeredCalls: 0, conversations: 0,
    };
    for (const key of ['newLeads', 'validBookings', 'outboundDials', 'answeredCalls', 'conversations']) {
      current[key] += row[key] || 0;
    }
    agencyBuckets.set(row.period, current);
  }
  const agencyRows = [...agencyBuckets.values()].sort((first, second) => first.period.localeCompare(second.period)).map((row) => ({
    ...row,
    leadToBookingRate: percentage(row.validBookings, row.newLeads),
    conversationToBookingRate: percentage(row.validBookings, row.conversations),
  }));
  return {
    summary: { clinics: clinics.length, periods: agencyRows.length },
    data: [...agencyRows, ...clinicRows],
  };
}

async function getTrends(filters) {
  return cached(cacheKey('trends', filters), () => buildTrends(filters));
}

async function getClinics(filters) {
  const rows = await getClinicMetricRows(filters, { search: filters.search });
  const rawMetrics = sortRows([...rows], filters);
  const result = paginate(rawMetrics.map(publicMetric), filters);
  return { summary: { ...combineMetrics(rawMetrics), pagination: result.pagination }, data: result.data };
}

async function getClinic(filters) {
  const clinics = await getClinicScope(filters);
  if (!clinics.length) throw new AppError('Clinic not found.', 404);
  const [metrics, trends] = await Promise.all([calculateClinicMetrics(filters, clinics[0]), getClinicTrends(filters, clinics[0])]);
  return { summary: publicMetric(metrics), data: trends };
}

async function buildCsrRows(filters) {
  const match = {};
  if (filters.csrId) match._id = objectId(filters.csrId);
  if (filters.clinicId) match.clinicIds = objectId(filters.clinicId);
  if (filters.search) {
    const search = new RegExp(escapeRegex(filters.search), 'i');
    match.$or = [{ name: search }, { email: search }, { externalUserId: search }];
  }
  const csrs = await CSR.find(match).sort({ name: 1 }).lean();
  const clinics = await getClinicScope(filters);
  return Promise.all(csrs.map(async (csr) => {
    const scopedFilters = { ...filters, csrId: String(csr._id) };
    const csrClinics = clinics.filter((clinic) => csr.clinicIds.some((id) => String(id) === String(clinic._id)) || filters.clinicId);
    const rows = await Promise.all(csrClinics.map((clinic) => calculateClinicMetrics(scopedFilters, clinic)));
    return {
      csrId: String(csr._id),
      externalUserId: csr.externalUserId,
      name: csr.name,
      email: csr.email,
      clinic: csrClinics.map((clinic) => clinic.name).join(', '),
      clinics: csrClinics.map((clinic) => ({ id: String(clinic._id), name: clinic.name })),
      ...combineMetrics(rows),
    };
  }));
}

async function getCsrRows(filters) {
  return cached(cacheKey('csr-metrics', filters), () => buildCsrRows(filters));
}

async function getCsrs(filters) {
  const rows = sortRows([...(await getCsrRows(filters))], filters);
  const result = paginate(rows, filters);
  return { summary: { pagination: result.pagination }, data: result.data };
}

async function getCsr(filters) {
  const rows = await getCsrRows(filters);
  if (!rows.length) throw new AppError('CSR not found.', 404);
  const clinics = await getClinicScope(filters);
  const scopedFilters = { ...filters, csrId: rows[0].csrId };
  const trends = (await Promise.all(clinics.map((clinic) => getClinicTrends(scopedFilters, clinic)))).flat();
  return { summary: rows[0], data: trends };
}

async function getBookingRatios(filters) {
  const clinics = await getClinicScope(filters);
  const rows = [];
  for (const clinic of clinics) {
    const csrs = await CSR.find({ clinicIds: clinic._id, ...(filters.csrId ? { _id: objectId(filters.csrId) } : {}) }).lean();
    for (const csr of csrs) {
      const metrics = await calculateClinicMetrics({ ...filters, csrId: String(csr._id) }, clinic);
      rows.push({
        clinicId: String(clinic._id), clinicName: clinic.name, csrId: String(csr._id), csrName: csr.name,
        bookings: metrics.validBookings, conversations: metrics.conversations, newLeads: metrics.newLeads,
        bookingRatio: metrics.bookingRatio, leadToBookingRate: metrics.leadToBookingRate,
      });
    }
  }
  const sorted = sortRows(rows, { ...filters, sortBy: filters.sortBy === 'name' ? 'csrName' : filters.sortBy });
  const result = paginate(sorted, filters);
  return { summary: { pagination: result.pagination }, data: result.data };
}

async function getSpeedToLead(filters) {
  const metricRows = await getClinicMetricRows(filters);
  const rows = metricRows.map((row) => ({
    clinicId: row.clinicId, clinicName: row.name, averageSpeedToLeadSeconds: row.averageSpeedToLeadSeconds,
    medianSpeedToLeadSeconds: row.medianSpeedToLeadSeconds, contactedWithin1Minute: row.contactedWithin1Minute,
    contactedWithin5Minutes: row.contactedWithin5Minutes, contactedWithin15Minutes: row.contactedWithin15Minutes,
    sampleSize: row.speedSampleSize,
  }));
  const all = await getOverview(filters);
  const local = combineMetrics(metricRows);
  const expectedSampleSize = Number(all.summary.newLeads);
  const sampleSize = local.speedSampleSize;
  const sampleComplete = Number.isFinite(expectedSampleSize) && sampleSize === expectedSampleSize;
  return { summary: {
    averageSpeedToLeadSeconds: all.summary.averageSpeedToLeadSeconds,
    medianSpeedToLeadSeconds: sampleSize ? local.medianSpeedToLeadSeconds : null,
    contactedWithin1Minute: local.contactedWithin1Minute,
    contactedWithin5Minutes: local.contactedWithin5Minutes,
    contactedWithin15Minutes: local.contactedWithin15Minutes,
    sampleSize,
    expectedSampleSize,
    sampleComplete,
    source: sampleComplete ? 'canonical_speed_sample_certified' : 'canonical_speed_sample',
    sourceAsOf: all.summary.sourceAsOf,
  }, data: rows };
}

async function getCallEfficiency(filters) {
  const overview = await getOverview(filters);
  const clinics = await getClinicScope(filters);
  const hourlyRows = (await Promise.all(clinics.map(async (clinic) => {
    const range = clinicDateRange(filters, clinic);
    return Call.aggregate([
      { $match: callMatch(filters, clinic, range) },
      { $group: { _id: '$externalCallId', startedAt: { $first: '$startedAt' }, direction: { $first: '$direction' } } },
      { $match: { direction: 'outbound' } },
      { $group: { _id: { $hour: { date: '$startedAt', timezone: clinic.timezone } }, outboundDials: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
  }))).flat();
  const hourMap = new Map(Array.from({ length: 24 }, (_value, hour) => [hour, 0]));
  hourlyRows.forEach((row) => hourMap.set(row._id, (hourMap.get(row._id) || 0) + row.outboundDials));
  const hourlyDistribution = [...hourMap.entries()].map(([hour, outboundDials]) => ({ hour, outboundDials }));
  return {
    summary: {
      outboundDials: overview.summary.outboundDials, uniqueLeadsDialed: overview.summary.uniqueLeadsDialed,
      dialsPerLead: overview.summary.dialsPerLead, answeredOutboundCalls: overview.summary.answeredOutboundCalls,
      answerRate: overview.summary.answerRate, conversations: overview.summary.conversations,
      conversationRate: overview.summary.conversationRate,
      hourlyDistribution,
    },
    data: overview.data.map((row) => ({
      clinicId: row.clinicId, clinicName: row.name, outboundDials: row.outboundDials,
      uniqueLeadsDialed: row.uniqueLeadsDialed, dialsPerLead: row.dialsPerLead,
      answerRate: row.answerRate, conversationRate: row.conversationRate,
    })),
  };
}

async function getTalkTime(filters) {
  const supportsAuthoritativeAgentMetrics = !filters.clinicId && !filters.csrId &&
    !filters.campaignId && !filters.groupId;
  if (supportsAuthoritativeAgentMetrics) {
    try {
      const metric = await hotProspectorAgentMetrics.getAgentMetrics(filters);
      return {
        summary: {
          talkTimeSeconds: metric.talkTimeSeconds,
          workingTimeSeconds: metric.workingTimeSeconds,
          totalGapTimeSeconds: metric.totalGapTimeSeconds,
          conversations: metric.conversations,
          talkTimeUtilization: metric.talkTimeUtilization,
          averageTalkTimePerConversation: metric.averageTalkTimePerConversation,
          source: 'hot_prospector_agent_dashboard',
          sourceAsOf: metric.fetchedAt,
        },
        data: metric.data,
      };
    } catch (error) {
      if (error.code !== 'HOT_PROSPECTOR_AGENT_RANGE_UNSUPPORTED') throw error;
    }
  }
  const overview = await getOverview(filters);
  return {
    summary: {
      talkTimeSeconds: overview.summary.talkTimeSeconds, workingTimeSeconds: overview.summary.workingTimeSeconds,
      totalGapTimeSeconds: overview.summary.totalGapTimeSeconds, talkTimeUtilization: overview.summary.talkTimeUtilization,
      averageTalkTimePerConversation: overview.summary.averageTalkTimePerConversation,
    },
    data: overview.data.map((row) => ({
      clinicId: row.clinicId, clinicName: row.name, talkTimeSeconds: row.talkTimeSeconds,
      workingTimeSeconds: row.workingTimeSeconds, totalGapTimeSeconds: row.totalGapTimeSeconds,
      talkTimeUtilization: row.talkTimeUtilization, averageTalkTimePerConversation: row.averageTalkTimePerConversation,
    })),
  };
}

async function precomputeDailyMetrics(date = new Date(Date.now() - 86400000)) {
  const log = await SyncLog.create({ syncType: 'daily_metrics_precompute', startedAt: new Date(), status: 'running', metadata: {} });
  try {
    const clinics = await Clinic.find({ reportingVisible: { $ne: false } }).lean();
    for (const clinic of clinics) {
      const localDate = formatApiDate(date, clinic.timezone);
      const filters = {
        startDate: localDate, endDate: localDate, clinicId: String(clinic._id), csrId: null,
        campaignId: null, groupId: null, period: 'daily', page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc', search: '',
      };
      const metric = await calculateClinicMetrics(filters, clinic);
      await DailyClinicMetric.updateOne(
        { date: new Date(`${localDate}T00:00:00.000Z`), clinicId: clinic._id },
        { $set: { ...publicMetric(metric), date: new Date(`${localDate}T00:00:00.000Z`), clinicId: clinic._id, generatedAt: new Date() } },
        { upsert: true, runValidators: true }
      );
      log.recordsFetched += metric.newLeads + metric.outboundDials + metric.validBookings;
      log.recordsUpdated += 1;
    }
    log.status = 'success';
  } catch (error) {
    log.status = 'failed';
    log.recordsFailed += 1;
    log.errorMessage = error.message;
    throw error;
  } finally {
    log.completedAt = new Date();
    await log.save();
  }
  return log;
}

module.exports = {
  getOverview,
  getTrends,
  getClinics,
  getClinic,
  getCsrs,
  getCsr,
  getBookingRatios,
  getSpeedToLead,
  getCallEfficiency,
  getTalkTime,
  precomputeDailyMetrics,
};
