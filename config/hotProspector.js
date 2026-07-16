const env = require('./env');

const endpointDefinitions = Object.freeze({
  login: { method: 'LoginUser', resultKeys: [] },
  campaigns: { method: 'FetchAllCampaigns', resultKeys: ['result', 'campaigns', 'data'] },
  groups: { method: 'FetchAllGroups', resultKeys: ['group', 'groups', 'data'] },
  users: { method: 'getMemberUsers', resultKeys: ['data', 'results', 'members', 'message'] },
  memberDashboard: { method: 'getMemberDashboardData', resultKeys: ['Results', 'results', 'data'] },
  campaignDashboard: { method: 'getDashboardMemberDatabyCampaign', resultKeys: ['Results', 'results', 'data'] },
  userCallLogs: { method: 'FetchUserCallLog', resultKeys: ['Results', 'results', 'data'], paginated: true },
  leadCallLogs: { method: 'FetchLeadCallLogs', resultKeys: ['Results', 'results', 'data'] },
  callTranscripts: { method: 'FetchCallTranscripts', resultKeys: ['Results', 'results', 'data'], paginated: true },
  leads: {
    method: process.env.HOT_PROSPECTOR_METHOD_LEADS || 'SearchByUserInput',
    resultKeys: ['Results', 'results', 'leads', 'data'],
    paginated: true,
  },
  appointments: {
    method: process.env.HOT_PROSPECTOR_METHOD_APPOINTMENTS || 'FetchAppointments',
    resultKeys: ['Results', 'results', 'appointments', 'data'],
    paginated: true,
  },
});

module.exports = Object.freeze({
  baseUrl: env.hotProspector.baseUrl.replace(/\/$/, ''),
  tokenPath: '/auth/token',
  refreshPath: '/auth/refresh',
  requestPath: '/request',
  timeoutMs: env.hotProspector.timeoutMs,
  retries: env.hotProspector.retries,
  pageSize: 500,
  endpoints: endpointDefinitions,
});
