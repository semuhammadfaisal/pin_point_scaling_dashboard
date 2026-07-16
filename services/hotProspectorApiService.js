const config = require('../config/hotProspector');
const client = require('./hotProspectorClient');

let appointmentsUnavailable = false;

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
  const limit = Math.min(500, Math.max(1, Number(options.limit || config.pageSize)));
  const maxPages = Math.max(1, Number(options.maxPages || 1000));
  const records = [];
  const pageSignatures = new Set();
  let offset = Math.max(0, Number(options.offset || 0));

  for (let page = 0; page < maxPages; page += 1) {
    const response = unwrapResponse(await client.request(endpointKey, { ...parameters, limit, offset }));
    const pageRecords = extractRecords(endpointKey, response);
    const signature = pageRecords.length
      ? JSON.stringify([pageRecords.length, pageRecords[0], pageRecords[pageRecords.length - 1]])
      : 'empty';
    if (pageSignatures.has(signature)) break;
    pageSignatures.add(signature);
    records.push(...pageRecords);
    const hasMore = response?.has_more === true || String(response?.has_more).toLowerCase() === 'true';
    if (!hasMore || pageRecords.length === 0) break;
    const nextOffset = Number(response?.next_offset);
    offset = Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : offset + pageRecords.length;
  }
  return records;
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
  if (appointmentsUnavailable) return [];
  try {
    return await fetchPaginated('appointments', {
      campaignId,
      groupId,
      from_date: fromDate,
      to_date: toDate,
    });
  } catch (error) {
    if (error.response?.status === 404) {
      appointmentsUnavailable = true;
      return [];
    }
    throw error;
  }
}

async function testConnection() {
  const response = unwrapResponse(await client.request('login'));
  if (!successful(response)) throw new Error(response?.message || 'Hot Prospector authentication failed.');
  return { ok: true, message: response.message || 'Successfully authenticated.' };
}

module.exports = {
  unwrapResponse,
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
