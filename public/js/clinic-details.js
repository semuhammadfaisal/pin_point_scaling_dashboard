import { createRequestManager, getMetrics } from './api.js';
import { initializeFilters } from './filters.js';
import { barChart, doughnutChart, lineChart, setChartState } from './charts.js';
import { clearAlert, decimal, duration, escapeHtml, number, percent, showAlert, speed } from './formatters.js';

const root = document.querySelector('[data-clinic-details]');
const clinicId = root.dataset.clinicId;
const manager = createRequestManager();
const chartIds = ['monthlyLeadsChart', 'monthlyBookingsChart', 'conversionTrendChart', 'csrComparisonChart', 'clinicSpeedChart', 'clinicCallsChart'];

function renderKpis(summary) {
  const formats = { leadToBookingRate: percent, conversationToBookingRate: percent, averageSpeedToLeadSeconds: speed, talkTimeSeconds: duration, totalGapTimeSeconds: duration, dialsPerLead: decimal, conversationRate: percent, talkTimeUtilization: percent, averageTalkTimePerConversation: duration };
  document.querySelectorAll('[data-kpi]').forEach((card) => {
    const key = card.dataset.kpi;
    const element = card.querySelector('[data-kpi-value]');
    element.textContent = (formats[key] || number)(summary[key]);
    element.classList.remove('skeleton-text');
  });
}

function renderCsrTable(rows) {
  const body = document.querySelector('[data-csr-table]');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="11"><div class="table-empty"><i class="bi bi-people"></i><strong>No CSR data</strong><span>No synchronized CSR records match this period.</span></div></td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small class="d-block text-muted">${escapeHtml(row.email || '')}</small></td><td>${number(row.outboundDials)}</td><td>${number(row.answeredCalls)}</td><td>${number(row.conversations)}</td><td>${number(row.validBookings)}</td><td>${percent(row.answerRate)}</td><td>${percent(row.conversationToBookingRate)}</td><td>${duration(row.talkTimeSeconds)}</td><td>${percent(row.talkTimeUtilization)}</td><td>${duration(row.averageTalkTimePerConversation)}</td><td>${speed(row.averageSpeedToLeadSeconds)}</td></tr>`).join('');
}

async function load(filters) {
  const signal = manager.next();
  chartIds.forEach((id) => setChartState(id, 'loading'));
  clearAlert();
  try {
    const [daily, monthly, csrs, speedMetrics] = await Promise.all([
      getMetrics(`clinics/${clinicId}`, { ...filters, period: 'daily' }, signal),
      getMetrics(`clinics/${clinicId}`, { ...filters, period: 'monthly' }, signal),
      getMetrics('csrs', { ...filters, clinicId, limit: 100, sortBy: 'validBookings', sortOrder: 'desc' }, signal),
      getMetrics('speed-to-lead', { ...filters, clinicId }, signal),
    ]);
    renderKpis(daily.summary);
    const monthlyRows = monthly.data;
    barChart('monthlyLeadsChart', monthlyRows.map((row) => row.period), [{ label: 'New leads', data: monthlyRows.map((row) => row.newLeads) }]);
    barChart('monthlyBookingsChart', monthlyRows.map((row) => row.period), [{ label: 'Bookings', data: monthlyRows.map((row) => row.validBookings), color: '#18a278' }]);
    lineChart('conversionTrendChart', daily.data.map((row) => row.period), [
      { label: 'Lead conversion %', data: daily.data.map((row) => row.leadToBookingRate) },
      { label: 'Conversation conversion %', data: daily.data.map((row) => row.conversationToBookingRate), color: '#18a278' },
    ]);
    const csrRows = csrs.data.slice(0, 12);
    barChart('csrComparisonChart', csrRows.map((row) => row.name), [
      { label: 'Dials', data: csrRows.map((row) => row.outboundDials) },
      { label: 'Bookings', data: csrRows.map((row) => row.validBookings), color: '#18a278' },
    ]);
    const speedSummary = speedMetrics.summary;
    doughnutChart('clinicSpeedChart', ['Within 1 min', '1–5 min', '5–15 min', 'Over 15 min'], [
      speedSummary.contactedWithin1Minute,
      Math.max(0, speedSummary.contactedWithin5Minutes - speedSummary.contactedWithin1Minute),
      Math.max(0, speedSummary.contactedWithin15Minutes - speedSummary.contactedWithin5Minutes),
      Math.max(0, 100 - speedSummary.contactedWithin15Minutes),
    ]);
    lineChart('clinicCallsChart', daily.data.map((row) => row.period), [
      { label: 'Outbound dials', data: daily.data.map((row) => row.outboundDials) },
      { label: 'Conversations', data: daily.data.map((row) => row.conversations), color: '#d49424' },
    ]);
    renderCsrTable(csrs.data);
  } catch (error) {
    if (error.name !== 'AbortError') showAlert(error.message);
  }
}

initializeFilters({ lockedClinicId: clinicId, onChange: load });
