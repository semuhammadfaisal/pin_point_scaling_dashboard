import { createRequestManager, getMetrics } from './api.js';
import { initializeFilters } from './filters.js';
import { barChart, doughnutChart, lineChart, setChartState } from './charts.js';
import { clearAlert, decimal, duration, initializeTooltips, number, percent, showAlert, speed } from './formatters.js';

const manager = createRequestManager();
const chartIds = ['leadsBookingsChart', 'dialsConversationsChart', 'clinicConversionChart', 'speedDistributionChart', 'callsByHourChart', 'csrBookingChart'];

const kpiFormatters = {
  newLeads: number,
  outboundDials: number,
  validBookings: number,
  leadToBookingRate: percent,
  averageSpeedToLeadSeconds: speed,
  medianSpeedToLeadSeconds: speed,
  talkTimeSeconds: duration,
  totalGapTimeSeconds: duration,
  dialsPerLead: decimal,
  conversationRate: percent,
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
    value.classList.remove('skeleton-text');
  });
}

function renderCsrChart(csrs) {
  const csrRows = csrs.data.slice(0, 12);
  barChart('csrBookingChart', csrRows.map((row) => row.name), [
    { label: 'Bookings', data: csrRows.map((row) => row.validBookings), color: '#5b5bd6' },
    { label: 'Booking ratio %', data: csrRows.map((row) => row.conversationToBookingRate), color: '#18a278' },
  ]);
}

function renderCharts({ trends, clinics, speedMetrics, efficiency }) {
  const agencyTrend = trends.data.filter((row) => row.scope === 'agency');
  const labels = agencyTrend.map((row) => row.period);
  lineChart('leadsBookingsChart', labels, [
    { label: 'New leads', data: agencyTrend.map((row) => row.newLeads), fill: true },
    { label: 'Bookings', data: agencyTrend.map((row) => row.validBookings), color: '#18a278' },
  ]);
  lineChart('dialsConversationsChart', labels, [
    { label: 'Outbound dials', data: agencyTrend.map((row) => row.outboundDials) },
    { label: 'Conversations', data: agencyTrend.map((row) => row.conversations), color: '#d49424' },
  ]);

  barChart('clinicConversionChart', clinics.data.map((row) => row.name), [{
    label: 'Lead conversion %', data: clinics.data.map((row) => row.leadToBookingRate), color: '#18a278',
  }], { scales: { y: { suggestedMax: 100, ticks: { callback: (value) => `${value}%` } } } });

  const speedSummary = speedMetrics.summary;
  const within1 = speedSummary.contactedWithin1Minute || 0;
  const within5 = speedSummary.contactedWithin5Minutes || 0;
  const within15 = speedSummary.contactedWithin15Minutes || 0;
  doughnutChart('speedDistributionChart', ['Within 1 min', '1–5 min', '5–15 min', 'Over 15 min'], [
    within1, Math.max(0, within5 - within1), Math.max(0, within15 - within5), Math.max(0, 100 - within15),
  ]);

  const hourly = efficiency.summary.hourlyDistribution || [];
  barChart('callsByHourChart', hourly.map((row) => `${String(row.hour).padStart(2, '0')}:00`), [{
    label: 'Outbound dials', data: hourly.map((row) => row.outboundDials), color: '#3d83d5',
  }]);

}

async function load(filters) {
  const signal = manager.next();
  loading();
  clearAlert();
  const shared = { ...filters };
  try {
    const [overview, trends, clinics, speedMetrics, efficiency] = await Promise.all([
      getMetrics('overview', shared, signal),
      getMetrics('trends', { ...shared, period: 'daily' }, signal),
      getMetrics('clinics', { ...shared, limit: 100, sortBy: 'leadToBookingRate', sortOrder: 'desc' }, signal),
      getMetrics('speed-to-lead', shared, signal),
      getMetrics('call-efficiency', shared, signal),
    ]);
    renderKpis(overview.summary);
    renderCharts({ trends, clinics, speedMetrics, efficiency });
    const csrs = await getMetrics('csrs', { ...shared, limit: 100, sortBy: 'validBookings', sortOrder: 'desc' }, signal);
    renderCsrChart(csrs);
  } catch (error) {
    if (error.name !== 'AbortError') showAlert(error.message);
  }
}

initializeTooltips();
initializeFilters({ onChange: load });
window.addEventListener('pagehide', () => manager.abort());
