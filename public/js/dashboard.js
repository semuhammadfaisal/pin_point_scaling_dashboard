import { createRequestManager, getMetrics } from './api.js';
import { initializeFilters } from './filters.js';
import { barChart, doughnutChart, lineChart, setChartEmpty, setChartState } from './charts.js';
import { clearAlert, decimal, duration, initializeTooltips, number, percent, showAlert, speed } from './formatters.js';

const manager = createRequestManager();
const overviewManager = createRequestManager();
const agentMetricsManager = createRequestManager();
const supportingManager = createRequestManager();
let activeFilters = null;
let filterGeneration = 0;
let liveRequestInFlight = false;
let supportingRequestInFlight = false;
let lastOverviewSignature = null;
let lastSupportingRefreshAt = 0;
const chartIds = ['leadsBookingsChart', 'dialsConversationsChart', 'clinicConversionChart', 'speedDistributionChart', 'callsByHourChart', 'csrBookingChart'];

const kpiFormatters = {
  newLeads: number,
  outboundDials: number,
  answeredCalls: number,
  validBookings: number,
  leadToBookingRate: percent,
  appointmentToAnswerRate: percent,
  averageSpeedToLeadSeconds: speed,
  medianSpeedToLeadSeconds: speed,
  talkTimeSeconds: duration,
  totalGapTimeSeconds: duration,
  dialsPerLead: decimal,
  decisionMakers: number,
  talkTimeUtilization: percent,
  averageTalkTimePerConversation: duration,
};

function loading() {
  document.querySelectorAll('[data-kpi-value]').forEach((element) => {
    element.textContent = 'Loading';
    element.classList.add('skeleton-text');
  });
  chartIds.forEach((id) => setChartState(id, 'loading'));
}

function renderKpis(summary) {
  document.querySelectorAll('[data-kpi]').forEach((card) => {
    const key = card.dataset.kpi;
    const value = card.querySelector('[data-kpi-value]');
    value.textContent = (kpiFormatters[key] || number)(summary[key]);
    card.dataset.metricRaw = JSON.stringify(summary[key] ?? null);
    value.classList.remove('skeleton-text');
    card.querySelector('[data-kpi-note]').textContent = summary[key] === null || summary[key] === undefined
      ? 'Unavailable from verified source'
      : 'Selected period';
  });
}

function renderKpiSubset(summary, notes = {}) {
  Object.entries(summary).forEach(([key, metricValue]) => {
    const card = document.querySelector(`[data-kpi="${key}"]`);
    if (!card) return;
    const value = card.querySelector('[data-kpi-value]');
    const nextRaw = JSON.stringify(metricValue ?? null);
    const changed = card.dataset.metricRaw !== undefined && card.dataset.metricRaw !== nextRaw;
    value.textContent = (kpiFormatters[key] || number)(metricValue);
    card.dataset.metricRaw = nextRaw;
    value.classList.remove('skeleton-text');
    card.querySelector('[data-kpi-note]').textContent = notes[key] ||
      (metricValue === null || metricValue === undefined ? 'Unavailable from verified source' : 'Selected period');
    if (changed) {
      card.classList.remove('metric-updated');
      window.requestAnimationFrame(() => card.classList.add('metric-updated'));
      window.setTimeout(() => card.classList.remove('metric-updated'), 1200);
    }
  });
}

function setLiveStatus(state, timestamp = null) {
  const status = document.querySelector('[data-live-update-status]');
  const text = status?.querySelector('[data-live-update-text]');
  if (!status || !text) return;
  status.className = `live-update-status ${state}`;
  if (state === 'live') text.textContent = `Live updates on · checked ${timestamp.toLocaleTimeString()}`;
  else if (state === 'offline') text.textContent = 'Live update connection interrupted · retrying automatically';
  else text.textContent = 'Connecting live updates…';
}

function overviewSignature(summary) {
  return JSON.stringify([
    summary.newLeads, summary.outboundDials, summary.answeredCalls, summary.validBookings,
    summary.averageSpeedToLeadSeconds, summary.dialsPerLead, summary.decisionMakers,
  ]);
}

function renderQuality(response) {
  const banner = document.querySelector('[data-data-quality]');
  if (!banner) return;
  const status = response.certification || 'unverified';
  const source = response.source === 'hot_prospector' ? 'Hot Prospector' : response.source || 'Unknown source';
  const asOf = response.sourceAsOf ? new Date(response.sourceAsOf).toLocaleString() : 'unknown';
  const issue = response.qualityIssues?.[0] || '';
  banner.className = `data-quality-banner ${status}`;
  banner.textContent = `${status === 'certified' ? 'Certified' : 'Data status: ' + status} · ${source} · as of ${asOf}${issue ? ` · ${issue}` : ''}`;
}

function renderCsrChart(csrs, agentMetrics = null) {
  const authoritativeRows = (agentMetrics?.data || []).filter((row) => row.name && row.appointments !== null);
  const csrRows = (authoritativeRows.length ? authoritativeRows : csrs.data).slice(0, 12);
  if (!csrRows.length) {
    setChartEmpty('csrBookingChart', 'Agent appointment data is unavailable for this filter range.');
    return;
  }
  barChart('csrBookingChart', csrRows.map((row) => row.name), [
    { label: 'Bookings', data: csrRows.map((row) => row.appointments ?? row.validBookings), color: '#ff6b35' },
    { label: 'Booking ratio %', data: csrRows.map((row) => row.bookingRatio ?? row.conversationToBookingRate), color: '#12b76a' },
  ]);
}

function renderCharts({ overview, trends, clinics, speedMetrics, efficiency, talkMetrics }) {
  let agencyTrend = trends.data.filter((row) => row.scope === 'agency');
  const trendTotals = agencyTrend.reduce((totals, row) => ({
    newLeads: totals.newLeads + Number(row.newLeads || 0),
    validBookings: totals.validBookings + Number(row.validBookings || 0),
    outboundDials: totals.outboundDials + Number(row.outboundDials || 0),
  }), { newLeads: 0, validBookings: 0, outboundDials: 0 });
  const trendReconciles = overview?.summary &&
    trendTotals.newLeads === Number(overview.summary.newLeads || 0) &&
    trendTotals.validBookings === Number(overview.summary.validBookings || 0) &&
    trendTotals.outboundDials === Number(overview.summary.outboundDials || 0);
  if ((!agencyTrend.length || !trendReconciles) && overview?.summary) {
    const filterLabel = overview.filters.startDate === overview.filters.endDate
      ? overview.filters.startDate
      : `${overview.filters.startDate}-${overview.filters.endDate}`;
    agencyTrend = [{
      period: filterLabel,
      newLeads: overview.summary.newLeads,
      validBookings: overview.summary.validBookings,
      outboundDials: overview.summary.outboundDials,
      conversations: talkMetrics?.summary?.conversations,
    }];
  }
  const labels = agencyTrend.map((row) => row.period);
  lineChart('leadsBookingsChart', labels, [
    { label: 'New leads', data: agencyTrend.map((row) => row.newLeads), fill: true },
    { label: 'Bookings', data: agencyTrend.map((row) => row.validBookings), color: '#12b76a' },
  ]);
  lineChart('dialsConversationsChart', labels, [
    { label: 'Total calls', data: agencyTrend.map((row) => row.outboundDials) },
    { label: 'Conversations', data: agencyTrend.map((row) => row.conversations), color: '#7f56d9' },
  ]);

  if (clinics.data.some((row) => row.validBookings !== null && (row.newLeads || row.validBookings))) {
    barChart('clinicConversionChart', clinics.data.map((row) => row.name), [{
      label: 'Lead conversion %', data: clinics.data.map((row) => row.leadToBookingRate), color: '#12b76a',
    }], { scales: { y: { suggestedMax: 100, ticks: { callback: (value) => `${value}%` } } } });
  } else {
    setChartEmpty('clinicConversionChart', 'Clinic conversion requires verified clinic mappings and appointment details.');
  }

  const speedSummary = speedMetrics.summary;
  const within1 = speedSummary.contactedWithin1Minute;
  const within5 = speedSummary.contactedWithin5Minutes;
  const within15 = speedSummary.contactedWithin15Minutes;
  const speedAvailable = ![within1, within5, within15].some((value) => value === null || value === undefined);
  if (!speedAvailable) setChartEmpty('speedDistributionChart', 'Speed distribution requires a synchronized first-dial sample.');
  doughnutChart('speedDistributionChart', ['Within 1 min', '1–5 min', '5–15 min', 'Over 15 min'], [
    speedAvailable ? within1 : 0,
    speedAvailable ? Math.max(0, within5 - within1) : 0,
    speedAvailable ? Math.max(0, within15 - within5) : 0,
    speedAvailable ? Math.max(0, 100 - within15) : 0,
  ]);

  const hourly = efficiency.summary.hourlyDistribution || [];
  if (!hourly.some((row) => row.outboundDials)) {
    setChartEmpty('callsByHourChart', 'Hourly distribution is waiting for synchronized detailed call timestamps.');
  }
  barChart('callsByHourChart', hourly.map((row) => `${String(row.hour).padStart(2, '0')}:00`), [{
    label: 'Outbound dials', data: hourly.map((row) => row.outboundDials), color: '#2e90fa',
  }]);

}

async function load(filters) {
  filterGeneration += 1;
  activeFilters = { ...filters };
  lastOverviewSignature = null;
  const signal = manager.next();
  loading();
  clearAlert();
  const shared = { ...filters };
  try {
    const overviewRequest = getMetrics('overview', shared, signal);
    const supportingRequests = Promise.all([
      getMetrics('trends', { ...shared, period: 'daily' }, signal),
      getMetrics('clinics', { ...shared, limit: 100, sortBy: 'leadToBookingRate', sortOrder: 'desc' }, signal),
      getMetrics('speed-to-lead', shared, signal),
      getMetrics('call-efficiency', shared, signal),
      getMetrics('talk-time', shared, signal),
    ]);
    const overview = await overviewRequest;
    renderKpis(overview.summary);
    lastOverviewSignature = overviewSignature(overview.summary);
    setLiveStatus('live', new Date());
    renderQuality(overview);
    const [trends, clinics, speedMetrics, efficiency, talkMetrics] = await supportingRequests;
    const speedNote = speedMetrics.summary.sampleComplete
      ? 'Verified complete first-dial sample'
      : `Unverified sample: ${speedMetrics.summary.sampleSize || 0} of ${speedMetrics.summary.expectedSampleSize || 0} leads`;
    renderKpiSubset({ medianSpeedToLeadSeconds: speedMetrics.summary.medianSpeedToLeadSeconds }, {
      medianSpeedToLeadSeconds: speedNote,
    });
    renderKpiSubset({
      talkTimeSeconds: talkMetrics.summary.talkTimeSeconds,
      totalGapTimeSeconds: talkMetrics.summary.totalGapTimeSeconds,
      talkTimeUtilization: talkMetrics.summary.talkTimeUtilization,
      averageTalkTimePerConversation: talkMetrics.summary.averageTalkTimePerConversation,
    }, {
      talkTimeSeconds: 'Verified Hot Prospector agent data',
      totalGapTimeSeconds: 'Verified Hot Prospector agent data',
      talkTimeUtilization: 'Talk time divided by working time',
      averageTalkTimePerConversation: 'Talk time divided by conversations',
    });
    renderCharts({ overview, trends, clinics, speedMetrics, efficiency, talkMetrics });
    const csrs = await getMetrics('csrs', { ...shared, limit: 100, sortBy: 'validBookings', sortOrder: 'desc' }, signal);
    renderCsrChart(csrs, talkMetrics);
  } catch (error) {
    if (error.name !== 'AbortError') showAlert(error.message);
  }
}

async function refreshSupportingMetrics(generation) {
  if (supportingRequestInFlight || !activeFilters || document.hidden) return;
  if (Date.now() - lastSupportingRefreshAt < 60000) return;
  supportingRequestInFlight = true;
  const shared = { ...activeFilters };
  try {
    const signal = supportingManager.next();
    const [overview, trends, clinics, speedMetrics, efficiency, talkMetrics, csrs] = await Promise.all([
      getMetrics('overview', shared, signal),
      getMetrics('trends', { ...shared, period: 'daily' }, signal),
      getMetrics('clinics', { ...shared, limit: 100, sortBy: 'leadToBookingRate', sortOrder: 'desc' }, signal),
      getMetrics('speed-to-lead', shared, signal),
      getMetrics('call-efficiency', shared, signal),
      getMetrics('talk-time', shared, signal),
      getMetrics('csrs', { ...shared, limit: 100, sortBy: 'validBookings', sortOrder: 'desc' }, signal),
    ]);
    if (generation !== filterGeneration) return;
    renderCharts({ overview, trends, clinics, speedMetrics, efficiency, talkMetrics });
    renderCsrChart(csrs, talkMetrics);
    lastSupportingRefreshAt = Date.now();
  } catch (error) {
    if (error.name !== 'AbortError') console.warn('Supporting dashboard refresh failed.', error);
  } finally {
    supportingRequestInFlight = false;
  }
}

async function refreshOverview() {
  if (!activeFilters || document.hidden || liveRequestInFlight) return;
  liveRequestInFlight = true;
  const generation = filterGeneration;
  try {
    const overview = await getMetrics('overview', activeFilters, overviewManager.next());
    if (generation !== filterGeneration) return;
    const signature = overviewSignature(overview.summary);
    const sourceChanged = lastOverviewSignature !== null && signature !== lastOverviewSignature;
    renderKpiSubset({
      newLeads: overview.summary.newLeads,
      outboundDials: overview.summary.outboundDials,
      answeredCalls: overview.summary.answeredCalls,
      validBookings: overview.summary.validBookings,
      leadToBookingRate: overview.summary.leadToBookingRate,
      appointmentToAnswerRate: overview.summary.appointmentToAnswerRate,
      averageSpeedToLeadSeconds: overview.summary.averageSpeedToLeadSeconds,
      dialsPerLead: overview.summary.dialsPerLead,
      decisionMakers: overview.summary.decisionMakers,
    });
    renderQuality(overview);
    lastOverviewSignature = signature;
    setLiveStatus('live', new Date());
    if (sourceChanged) refreshSupportingMetrics(generation);
  } catch (error) {
    if (error.name !== 'AbortError') setLiveStatus('offline');
  } finally {
    liveRequestInFlight = false;
  }
}

async function refreshAgentMetrics() {
  if (!activeFilters || document.hidden) return;
  try {
    const talkMetrics = await getMetrics('talk-time', activeFilters, agentMetricsManager.next());
    renderKpiSubset({
      talkTimeSeconds: talkMetrics.summary.talkTimeSeconds,
      totalGapTimeSeconds: talkMetrics.summary.totalGapTimeSeconds,
      talkTimeUtilization: talkMetrics.summary.talkTimeUtilization,
      averageTalkTimePerConversation: talkMetrics.summary.averageTalkTimePerConversation,
    }, {
      talkTimeSeconds: 'Verified Hot Prospector agent data',
      totalGapTimeSeconds: 'Verified Hot Prospector agent data',
      talkTimeUtilization: 'Talk time divided by working time',
      averageTalkTimePerConversation: 'Talk time divided by conversations',
    });
  } catch (error) {
    if (error.name !== 'AbortError') setLiveStatus('offline');
  }
}

initializeTooltips();
initializeFilters({ onChange: load });
const refreshTimer = window.setInterval(refreshOverview, 5000);
const agentRefreshTimer = window.setInterval(refreshAgentMetrics, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    refreshOverview();
    refreshAgentMetrics();
  }
});
window.addEventListener('pagehide', () => {
  window.clearInterval(refreshTimer);
  window.clearInterval(agentRefreshTimer);
  manager.abort();
  overviewManager.abort();
  agentMetricsManager.abort();
  supportingManager.abort();
});
