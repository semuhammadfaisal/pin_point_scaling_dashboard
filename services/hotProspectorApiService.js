const config = require('../config/hotProspector');
const client = require('./hotProspectorClient');

function unwrapResponse(value) {
  let response = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(response) && response.length === 1 && response[0] && typeof response[0] === 'object') {
      response = response[0];
      continue;
    }
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const keys = Object.keys(response);
      if (keys.length === 1 && /^\d+$/.test(keys[0]) && response[keys[0]] && typeof response[keys[0]] === 'object') {
        response = response[keys[0]];
        continue;
      }
    }
    break;
  }
  return response;
}

function successful(response) {
  response = unwrapResponse(response);
  return !['false', '0'].includes(String(response?.response).toLowerCase()) && response?.success !== false;
}

function emptyResult(response) {
  response = unwrapResponse(response);
  return /no .*(found|available)|unable to fetch dashboard data/i.test(String(response?.message || ''));
}

function extractRecords(endpointKey, response) {
  response = unwrapResponse(response);
  const endpoint = config.endpoints[endpointKey];
  for (const key of endpoint.resultKeys) {
    if (Array.isArray(response?.[key])) return response[key];
    if (Array.isArray(response?.[key]?.data)) return response[key].data;
  }
  if (!successful(response) && !emptyResult(response)) {
    throw new Error(response?.message || `Hot Prospector ${endpoint.method} request failed.`);
  }
  return [];
}

async function fetchPaginated(endpointKey, parameters = {}, options = {}) {
  const result = await fetchPaginatedWithMeta(endpointKey, parameters, options);
  if (!result.complete) {
    const error = new Error(
      `Hot Prospector ${config.endpoints[endpointKey].method} pagination was incomplete: ` +
      `received ${result.records.length} of ${result.expectedRecordCount ?? 'unknown'} records.`
    );
    error.code = 'HOT_PROSPECTOR_INCOMPLETE_PAGESET';
    error.pagination = result.metadata;
    throw error;
  }
  return result.records;
}

function recordIdentity(record) {
  if (!record || typeof record !== 'object') return JSON.stringify(record);
  const keys = ['CallId', 'callId', 'recordingId', 'LeadId', 'leadId', 'appointmentId', 'id'];
  const stable = keys.map((key) => record[key]).find((value) => value !== undefined && value !== null && value !== '');
  return stable === undefined ? JSON.stringify(record) : String(stable);
}

async function fetchPaginatedWithMeta(endpointKey, parameters = {}, options = {}) {
  const limit = Math.min(500, Math.max(1, Number(options.limit || config.pageSize)));
  const maxPages = Math.max(1, Number(options.maxPages || 1000));
  const records = [];
  const recordIdentities = new Set();
  const pageSignatures = new Set();
  let offset = Math.max(0, Number(options.offset || 0));
  let expectedRecordCount = null;
  let truncated = false;
  let duplicatePage = false;
  let pagesFetched = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const response = unwrapResponse(await client.request(endpointKey, { ...parameters, limit, offset }));
    pagesFetched += 1;
    const pageRecords = extractRecords(endpointKey, response);
    const statedTotal = Number(response?.total_records ?? response?.totalRecords ?? response?.total);
    if (Number.isFinite(statedTotal) && statedTotal >= 0) expectedRecordCount = statedTotal;
    const signature = pageRecords.length
      ? JSON.stringify([pageRecords.length, pageRecords[0], pageRecords[pageRecords.length - 1]])
      : 'empty';
    if (pageSignatures.has(signature)) {
      duplicatePage = true;
      break;
    }
    pageSignatures.add(signature);
    for (const record of pageRecords) {
      const identity = recordIdentity(record);
      if (recordIdentities.has(identity)) continue;
      recordIdentities.add(identity);
      records.push(record);
    }
    const hasMore = response?.has_more === true || String(response?.has_more).toLowerCase() === 'true';
    if (expectedRecordCount !== null && records.length >= expectedRecordCount) break;
    if (!hasMore || pageRecords.length === 0) {
      truncated = expectedRecordCount !== null && records.length < expectedRecordCount;
      break;
    }
    const nextOffset = Number(response?.next_offset);
    offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + pageRecords.length;
  }
  if (pagesFetched >= maxPages && expectedRecordCount !== null && records.length < expectedRecordCount) truncated = true;
  const complete = !duplicatePage && !truncated &&
    (expectedRecordCount === null || records.length === expectedRecordCount);
  return {
    records,
    expectedRecordCount,
    complete,
    metadata: { endpointKey, pagesFetched, expectedRecordCount, uniqueRecordCount: records.length, duplicatePage, truncated },
  };
}

async function fetchCampaigns() {
  return extractRecords('campaigns', await client.request('campaigns'));
}

async function fetchGroups() {
  return extractRecords('groups', await client.request('groups'));
}

async function fetchUsers() {
  return extractRecords('users', await client.request('users'));
}

async function fetchMemberDashboardData(date) {
  return extractRecords('memberDashboard', await client.request('memberDashboard', { date }));
}

async function fetchCampaignDashboardData(campaignId, date) {
  return extractRecords(
    'campaignDashboard',
    await client.request('campaignDashboard', { campaign_id: campaignId, date })
  );
}

async function fetchUserCallLogs({ fromDate, toDate, campaignId = '', groupId = '', memberId = '', ...filters }) {
  return fetchPaginated('userCallLogs', {
    from_date: fromDate,
    to_date: toDate,
    campaignId,
    groupId,
    memberId,
    sort_by: 'call_time',
    sort_order: 'ASC',
    ...filters,
  });
}

async function fetchLeadCallLogs({ leadId, fromDate, toDate, type = '' }) {
  return extractRecords(
    'leadCallLogs',
    await client.request('leadCallLogs', { LeadId: leadId, type, from_date: fromDate, to_date: toDate })
  );
}

async function fetchCallTranscripts({ fromDate, toDate, campaignId = '', groupId = '', memberId = '' }) {
  return fetchPaginated('callTranscripts', {
    from_date: fromDate,
    to_date: toDate,
    campaignId,
    groupId,
    memberId,
    sort_by: 'call_time',
    sort_order: 'ASC',
  });
}

async function fetchLeads({ groupId, fromDate, toDate }) {
  return fetchPaginated('leads', {
    GroupId: groupId,
    groupId,
    from_date: fromDate,
    to_date: toDate,
    searchField: 'first_name',
    searchText: '',
    sortBy: 'ASC',
  });
}

async function fetchAppointments({ campaignId, groupId, fromDate, toDate }) {
  return fetchPaginated('appointments', {
    campaignId,
    groupId,
    from_date: fromDate,
    to_date: toDate,
  });
}

async function testConnection() {
  const response = unwrapResponse(await client.request('login'));
  if (!successful(response)) throw new Error(response?.message || 'Hot Prospector authentication failed.');
  return { ok: true, message: response.message || 'Successfully authenticated.' };
}

module.exports = {
  unwrapResponse,
  extractRecords,
  fetchPaginatedWithMeta,
  fetchCampaigns,
  fetchGroups,
  fetchUsers,
  fetchMemberDashboardData,
  fetchCampaignDashboardData,
  fetchUserCallLogs,
  fetchLeadCallLogs,
  fetchCallTranscripts,
  fetchLeads,
  fetchAppointments,
  testConnection,
};
