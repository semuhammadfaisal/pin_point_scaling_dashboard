const mongoose = require('mongoose');
const DailyMetricV2 = require('../models/DailyMetricV2');
const SourceSnapshotV2 = require('../models/SourceSnapshotV2');
const Clinic = require('../models/Clinic');
const ReconciliationResultV2 = require('../models/ReconciliationResultV2');
const hotOverview = require('./hotProspectorOverviewService');
const reconciliation = require('./v2ReconciliationService');
const { derivedMetrics, percentage } = require('./metricContractService');

function sumNullable(rows, field) {
  if (!rows.length || rows.some((row) => row[field] === null || row[field] === undefined)) return null;
  return rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
}

function summarize(rows) {
  const speedTotal = rows.reduce((sum, row) => sum + Number(row.speedToLeadTotalSeconds || 0), 0);
  const speedSamples = rows.reduce((sum, row) => sum + Number(row.speedToLeadSampleSize || 0), 0);
  const result = {
    newLeads: rows.reduce((sum, row) => sum + Number(row.newLeads || 0), 0),
    outboundDials: rows.reduce((sum, row) => sum + Number(row.outboundDials || 0), 0),
    answeredCalls: sumNullable(rows, 'answeredCalls'),
    answeredOutboundCalls: sumNullable(rows, 'answeredCalls'),
    decisionMakers: sumNullable(rows, 'decisionMakers'),
    conversations: sumNullable(rows, 'conversations'),
    validBookings: sumNullable(rows, 'validBookings'),
    talkTimeSeconds: sumNullable(rows, 'talkTimeSeconds'),
    totalGapTimeSeconds: sumNullable(rows, 'gapTimeSeconds'),
    workingTimeSeconds: sumNullable(rows, 'workingTimeSeconds'),
    uniqueLeadsDialed: rows.reduce((sum, row) => sum + Number(row.uniqueLeadsDialed || 0), 0),
    averageSpeedToLeadSeconds: speedSamples ? Math.round(speedTotal / speedSamples) : null,
    medianSpeedToLeadSeconds: null,
  };
  result.dialsPerLead = result.uniqueLeadsDialed ? Math.round((result.outboundDials / result.uniqueLeadsDialed) * 100) / 100 : null;
  result.averageDialsPerLead = result.dialsPerLead;
  Object.assign(result, derivedMetrics(result));
  result.conversationToBookingRate = percentage(result.validBookings, result.conversations);
  return result;
}

function factMatch(filters, scopeType) {
  const match = { date: { $gte: filters.startDate, $lte: filters.endDate }, scopeType };
  if (filters.clinicId) match.clinicId = new mongoose.Types.ObjectId(filters.clinicId);
  if (filters.campaignId) match.campaignId = filters.campaignId;
  if (filters.groupId) match.groupId = filters.groupId;
  if (filters.csrId) match.csrExternalId = filters.csrId;
  return match;
}

async function responseMeta(filters, source = 'canonical_v2') {
  const status = await reconciliation.latestForRange(filters);
  const sourceAsOf = status.sourceAsOf ? new Date(status.sourceAsOf) : null;
  return {
    source,
    sourceAsOf: sourceAsOf?.toISOString() || null,
    freshnessSeconds: sourceAsOf ? Math.max(0, Math.round((Date.now() - sourceAsOf.getTime()) / 1000)) : null,
    certification: status.certification,
    qualityIssues: status.qualityIssues,
  };
}

async function exactOverviewSnapshot(filters) {
  if (filters.clinicId || filters.csrId || filters.groupId) return null;
  return SourceSnapshotV2.findOne({
    endpointKey: 'webOverview', complete: true,
    'filters.startDate': filters.startDate, 'filters.endDate': filters.endDate,
    'filters.campaignId': filters.campaignId || null,
  }).sort({ fetchedAt: -1 }).lean();
}

async function getOverview(filters) {
  const exact = await exactOverviewSnapshot(filters);
  if (exact) {
    const values = hotOverview.normalizeOverviewRecord(exact.payload);
    const summary = {
      ...values,
      decisionMakers: values.decisionMakers,
      conversations: null,
      validBookings: values.validBookings,
      leadToBookingRate: percentage(values.validBookings, values.newLeads),
      appointmentToAnswerRate: percentage(values.validBookings, values.answeredCalls),
      answerRate: percentage(values.answeredCalls, values.outboundDials),
      conversationRate: null,
      conversationToBookingRate: null,
      talkTimeSeconds: null,
      totalGapTimeSeconds: null,
      workingTimeSeconds: null,
      talkTimeUtilization: null,
      averageTalkTimePerConversation: null,
      medianSpeedToLeadSeconds: null,
      dialsPerLead: values.averageDialsPerLead,
    };
    delete summary.rawData;
    const latestReconciliation = await ReconciliationResultV2.findOne({ snapshotId: exact._id }).sort({ checkedAt: -1 }).lean();
    const qualityIssues = ['Conversation, median speed, talk time, working time, and gap time are unavailable in this source contract.'];
    return {
      summary, data: [],
      meta: {
        source: 'hot_prospector', sourceAsOf: exact.sourceAsOf.toISOString(),
        freshnessSeconds: Math.max(0, Math.round((Date.now() - exact.sourceAsOf.getTime()) / 1000)),
        certification: latestReconciliation?.status || 'unverified',
        qualityIssues: [...qualityIssues, ...(latestReconciliation?.qualityIssues || [])],
      },
    };
  }
  const scopeType = filters.csrId ? 'csr' : filters.clinicId ? 'clinic' : 'agency';
  const rows = await DailyMetricV2.find(factMatch(filters, scopeType)).sort({ date: 1 }).lean();
  const meta = await responseMeta(filters, rows[0]?.source || 'canonical_v2');
  if (!exact) meta.qualityIssues = [...meta.qualityIssues, 'No exact source snapshot exists for this filter range; daily facts were aggregated.'];
  return { summary: summarize(rows), data: [], meta };
}

async function groupedClinicRows(filters) {
  const facts = await DailyMetricV2.find(factMatch(filters, 'clinic')).lean();
  const byClinic = new Map();
  for (const fact of facts) {
    const key = String(fact.clinicId);
    if (!byClinic.has(key)) byClinic.set(key, []);
    byClinic.get(key).push(fact);
  }
  const clinics = await Clinic.find({ _id: { $in: [...byClinic.keys()] } }).select('name timezone').lean();
  const names = new Map(clinics.map((clinic) => [String(clinic._id), clinic]));
  return [...byClinic].map(([clinicId, rows]) => ({
    clinicId, name: names.get(clinicId)?.name || 'Unknown clinic', timezone: names.get(clinicId)?.timezone || 'UTC',
    ...summarize(rows),
  }));
}

function sortAndPage(rows, filters) {
  const direction = filters.sortOrder === 'desc' ? -1 : 1;
  const search = filters.search.toLowerCase();
  const filtered = search ? rows.filter((row) => String(row.name || row.clinic || '').toLowerCase().includes(search)) : rows;
  filtered.sort((a, b) => {
    const first = a[filters.sortBy] ?? 0;
    const second = b[filters.sortBy] ?? 0;
    return typeof first === 'string' ? first.localeCompare(String(second)) * direction : (Number(first) - Number(second)) * direction;
  });
  const start = (filters.page - 1) * filters.limit;
  return {
    rows: filtered.slice(start, start + filters.limit),
    pagination: { page: filters.page, limit: filters.limit, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / filters.limit)) },
  };
}

async function getClinics(filters) {
  const all = await groupedClinicRows(filters);
  const page = sortAndPage(all, filters);
  return { summary: { ...summarize([]), pagination: page.pagination }, data: page.rows, meta: await responseMeta(filters) };
}

async function getClinic(filters) {
  const all = await groupedClinicRows(filters);
  const row = all[0] || summarize([]);
  const trends = await getTrends(filters);
  return { summary: row, data: trends.data, meta: trends.meta };
}

async function getTrends(filters) {
  const scopeType = filters.clinicId ? 'clinic' : 'agency';
  const rows = await DailyMetricV2.find(factMatch(filters, scopeType)).sort({ date: 1 }).lean();
  const bucketKey = (date) => {
    if (filters.period === 'monthly') return date.slice(0, 7);
    if (filters.period === 'weekly') {
      const value = new Date(`${date}T00:00:00.000Z`);
      const day = value.getUTCDay() || 7;
      value.setUTCDate(value.getUTCDate() - day + 1);
      return value.toISOString().slice(0, 10);
    }
    return date;
  };
  const buckets = new Map();
  for (const row of rows) {
    const key = bucketKey(row.date);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const data = [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([period, facts]) => {
    const metric = summarize(facts);
    return {
      scope: scopeType, period, clinicId: facts[0].clinicId ? String(facts[0].clinicId) : null,
      newLeads: metric.newLeads, validBookings: metric.validBookings, outboundDials: metric.outboundDials,
      answeredCalls: metric.answeredCalls, decisionMakers: metric.decisionMakers, conversations: metric.conversations,
      leadToBookingRate: metric.leadToBookingRate, conversationToBookingRate: metric.conversationToBookingRate,
    };
  });
  return { summary: { periods: data.length }, data, meta: await responseMeta(filters, rows[0]?.source || 'canonical_v2') };
}

function unavailable(filters, message) {
  return responseMeta(filters).then((meta) => ({
    summary: {}, data: [], meta: { ...meta, certification: 'unverified', qualityIssues: [...meta.qualityIssues, message] },
  }));
}

async function getSpeedToLead(filters) {
  const overview = await getOverview(filters);
  return {
    summary: {
      averageSpeedToLeadSeconds: overview.summary.averageSpeedToLeadSeconds,
      medianSpeedToLeadSeconds: overview.summary.medianSpeedToLeadSeconds,
      contactedWithin1Minute: null, contactedWithin5Minutes: null, contactedWithin15Minutes: null,
      sampleSize: null,
    }, data: [], meta: overview.meta,
  };
}

async function getCallEfficiency(filters) {
  const overview = await getOverview(filters);
  return {
    summary: {
      outboundDials: overview.summary.outboundDials, uniqueLeadsDialed: overview.summary.uniqueLeadsDialed,
      dialsPerLead: overview.summary.dialsPerLead, answeredOutboundCalls: overview.summary.answeredCalls,
      answerRate: overview.summary.answerRate, decisionMakers: overview.summary.decisionMakers,
      conversations: overview.summary.conversations, conversationRate: overview.summary.conversationRate,
      hourlyDistribution: [],
    }, data: [], meta: overview.meta,
  };
}

async function getTalkTime(filters) {
  const overview = await getOverview(filters);
  return {
    summary: {
      talkTimeSeconds: overview.summary.talkTimeSeconds, workingTimeSeconds: overview.summary.workingTimeSeconds,
      totalGapTimeSeconds: overview.summary.totalGapTimeSeconds,
      talkTimeUtilization: overview.summary.talkTimeUtilization,
      averageTalkTimePerConversation: overview.summary.averageTalkTimePerConversation,
    }, data: [], meta: overview.meta,
  };
}

module.exports = {
  getOverview, getTrends, getClinics, getClinic, getSpeedToLead, getCallEfficiency, getTalkTime,
  getCsrs: (filters) => unavailable(filters, 'CSR facts have not been certified.'),
  getCsr: (filters) => unavailable(filters, 'CSR facts have not been certified.'),
  getBookingRatios: (filters) => unavailable(filters, 'Booking-ratio facts have not been certified.'),
  summarize,
};
