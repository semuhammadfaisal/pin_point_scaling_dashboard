const axios = require('axios');
const env = require('../config/env');
const { parseDuration } = require('../utils/date');
const { logApiError } = require('../utils/apiLogger');
const hotProspectorConfig = require('../config/hotProspector');

const endpoint = hotProspectorConfig.webEndpoints.overview;
const cache = new Map();
const inFlight = new Map();
const cacheTtlMs = env.metrics.overviewCacheTtlMs;

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function displayDate(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return `${month}/${day}/${year}`;
}

function normalizeOverviewRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Hot Prospector overview returned an invalid response.');
  return {
    newLeads: numberValue(record.total_lead_campaign),
    outboundDials: numberValue(record.total_calls),
    answeredCalls: numberValue(record.total_answer),
    decisionMakers: numberValue(record.mdm ?? record.totaldecisionMaker),
    conversations: null,
    validBookings: numberValue(record.total_appointment_overview),
    averageSpeedToLeadSeconds: parseDuration(record.Avg_speed),
    averageDialsPerLead: numberValue(record.averge_calls_per_lead),
    rawData: record,
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function getOverviewMetrics(filters) {
  if (!env.hotProspector.webCookie) {
    throw new Error('HOT_PROSPECTOR_WEB_COOKIE is required for authoritative overview metrics.');
  }
  const payload = {
    select_date: '',
    month: '',
    week: `${displayDate(filters.startDate)} - ${displayDate(filters.endDate)}`,
    campaign: filters.campaignId || '',
    tagIds: '',
    startTimeObj: '',
    endTimeObj: '',
    noOfSec: '35',
  };
  const cacheKey = JSON.stringify(payload);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < cacheTtlMs) return cached.value;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const request = (async () => {
    let lastError;
    const attempts = Math.min(3, Math.max(1, env.hotProspector.retries + 1));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await axios.post(endpoint, new URLSearchParams(payload), {
          timeout: Math.max(30000, env.hotProspector.timeoutMs),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json, text/javascript, */*; q=0.01',
            Cookie: env.hotProspector.webCookie,
          },
        });
        const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        const value = { ...normalizeOverviewRecord(body), fetchedAt: new Date() };
        cache.set(cacheKey, { createdAt: Date.now(), value });
        return value;
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) await wait(500 * 2 ** attempt);
      }
    }
    logApiError(lastError, { endpoint: 'get_total_record', operation: 'fetch_overview_metrics' });
    throw new Error('Unable to retrieve the authoritative Hot Prospector overview metrics.');
  })();
  inFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    inFlight.delete(cacheKey);
  }
}

module.exports = { getOverviewMetrics, normalizeOverviewRecord };
