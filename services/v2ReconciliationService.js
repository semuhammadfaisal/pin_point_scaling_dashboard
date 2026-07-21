const DailyMetricV2 = require('../models/DailyMetricV2');
const ReconciliationResultV2 = require('../models/ReconciliationResultV2');
const DataQualityIssueV2 = require('../models/DataQualityIssueV2');
const payload = require('./v2PayloadService');
const quality = require('./v2QualityService');
const env = require('../config/env');

const COMPARABLE_METRICS = ['newLeads', 'outboundDials', 'answeredCalls', 'validBookings'];

function compare(metric, expected, actual) {
  const known = expected !== null && expected !== undefined && actual !== null && actual !== undefined;
  return {
    metric,
    expected: expected ?? null,
    actual: actual ?? null,
    difference: known ? actual - expected : null,
    matches: known && actual === expected,
  };
}

async function reconcileDay(date) {
  const agency = await DailyMetricV2.findOne({ date, scopeType: 'agency', scopeKey: 'agency' }).lean();
  if (!agency) throw new Error(`No v2 agency source metric exists for ${date}.`);
  const clinics = await DailyMetricV2.find({ date, scopeType: 'clinic' }).lean();
  const actual = clinics.reduce((sum, row) => {
    for (const metric of COMPARABLE_METRICS) {
      if (row[metric] === null || row[metric] === undefined) sum[metric] = null;
      else if (sum[metric] !== null) sum[metric] = (sum[metric] || 0) + row[metric];
    }
    return sum;
  }, {});
  const metrics = COMPARABLE_METRICS.map((metric) => compare(metric, agency[metric], actual[metric]));
  const hasUnknown = metrics.some((row) => row.actual === null);
  const hasMismatch = metrics.some((row) => row.actual !== null && !row.matches);
  const criticalIssues = await DataQualityIssueV2.find({ status: 'open', severity: 'critical' })
    .select('category message').limit(50).lean();
  let status = hasMismatch ? 'mismatch' : hasUnknown || criticalIssues.length ? 'unverified' : 'certified';
  if (Date.now() - new Date(agency.sourceAsOf).getTime() > env.metrics.v2StaleAfterMs) status = 'stale';
  const reconciliationKey = payload.hash({ date, scope: 'agency' });
  const result = await ReconciliationResultV2.create({
    reconciliationKey,
    snapshotId: agency.sourceSnapshotId,
    filters: { startDate: date, endDate: date },
    sourceAsOf: agency.sourceAsOf,
    status,
    metrics,
    qualityIssues: criticalIssues.map((issue) => `${issue.category}: ${issue.message}`),
    checkedAt: new Date(),
  });
  await DailyMetricV2.updateMany({ date }, {
    $set: {
      certification: status,
      qualityIssues: result.qualityIssues,
    },
  });
  if (hasMismatch) {
    await quality.report('metric_mismatch', `Canonical v2 totals do not match Hot Prospector for ${date}.`, {
      severity: 'critical', discriminator: date, details: { metrics },
    });
  }
  return result;
}

async function reconcileRange(startDate, endDate) {
  const results = [];
  let date = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (date <= end) {
    const day = date.toISOString().slice(0, 10);
    try {
      results.push(await reconcileDay(day));
    } catch (error) {
      await quality.report('reconciliation_failure', `Reconciliation could not run for ${day}: ${error.message}`, {
        severity: 'critical', discriminator: day,
      });
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return results;
}

async function latestForRange(filters) {
  const rows = await ReconciliationResultV2.aggregate([
    { $match: { 'filters.startDate': { $gte: filters.startDate }, 'filters.endDate': { $lte: filters.endDate } } },
    { $sort: { checkedAt: -1 } },
    { $group: { _id: '$filters.startDate', row: { $first: '$$ROOT' } } },
  ]);
  if (!rows.length) return { certification: 'unverified', sourceAsOf: null, qualityIssues: ['No v2 reconciliation has run for this range.'] };
  const values = rows.map(({ row }) => row);
  const precedence = ['certified', 'unverified', 'stale', 'mismatch'];
  const certification = values.reduce((worst, row) =>
    precedence.indexOf(row.status) > precedence.indexOf(worst) ? row.status : worst, 'certified');
  const sourceAsOf = values.reduce((oldest, row) => !oldest || row.sourceAsOf < oldest ? row.sourceAsOf : oldest, null);
  return {
    certification,
    sourceAsOf,
    qualityIssues: [...new Set(values.flatMap((row) => row.qualityIssues || []))].slice(0, 20),
  };
}

module.exports = { COMPARABLE_METRICS, compare, reconcileDay, reconcileRange, latestForRange };
