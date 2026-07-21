const env = require('../config/env');
const v1 = require('./metricsService');
const v2 = require('./metricsV2Service');
const SyncLog = require('../models/SyncLog');

const methods = [
  'getOverview', 'getTrends', 'getClinics', 'getClinic', 'getCsrs', 'getCsr',
  'getBookingRatios', 'getSpeedToLead', 'getCallEfficiency', 'getTalkTime',
];

async function v1Meta(result) {
  const authoritativeSources = new Set([
    'hot_prospector_overview',
    'hot_prospector_agent_dashboard',
    'canonical_speed_sample_certified',
  ]);
  const authoritative = authoritativeSources.has(result.summary?.source);
  const partialSpeed = result.summary?.source === 'canonical_speed_sample';
  const latest = authoritative ? null : await SyncLog.findOne({ status: { $in: ['success', 'partial'] } })
    .sort({ completedAt: -1 }).select('completedAt status').lean();
  const authoritativeAsOf = result.summary?.sourceAsOf ? new Date(result.summary.sourceAsOf) : null;
  const sourceAsOf = authoritativeAsOf || latest?.completedAt || null;
  const issues = partialSpeed
    ? [`Median speed is based on ${result.summary.sampleSize} of ${result.summary.expectedSampleSize} leads and is not certified.`]
    : ['Legacy v1 data is not certified.'];
  if (authoritative) issues.splice(0, issues.length,
    result.summary?.source === 'hot_prospector_agent_dashboard'
      ? 'Talk, gap, working-time, and conversation fields are source-exact.'
      : 'Live source totals are exact for this filter snapshot.');
  return {
    source: authoritative ? 'hot_prospector' : partialSpeed ? 'canonical_v1_sample' : 'canonical_v1',
    sourceAsOf: sourceAsOf?.toISOString() || null,
    freshnessSeconds: sourceAsOf ? Math.max(0, Math.round((Date.now() - sourceAsOf.getTime()) / 1000)) : null,
    certification: authoritative ? 'certified' : 'unverified',
    qualityIssues: issues,
  };
}

const facade = {};
for (const method of methods) {
  facade[method] = async (filters) => {
    if (env.metrics.dataVersion === 'v2') return v2[method](filters);
    const result = await v1[method](filters);
    return { ...result, meta: await v1Meta(result) };
  };
}

module.exports = facade;
