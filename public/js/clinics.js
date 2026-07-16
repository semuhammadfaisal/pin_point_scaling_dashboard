import { createRequestManager, getMetrics } from './api.js';
import { initializeFilters } from './filters.js';
import { clearAlert, debounce, downloadCsv, duration, escapeHtml, number, percent, renderPagination, showAlert, speed } from './formatters.js';

const manager = createRequestManager();
let filters = {};
let state = { page: 1, limit: 25, search: '', sortBy: 'name', sortOrder: 'asc' };
let currentRows = [];

function skeleton() {
  document.querySelector('[data-table-body]').innerHTML = Array.from({ length: 5 }, () => '<tr class="skeleton-row"><td colspan="16"><span></span></td></tr>').join('');
}

function renderRows(rows) {
  const body = document.querySelector('[data-table-body]');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="16"><div class="table-empty"><i class="bi bi-hospital"></i><strong>No clinics found</strong><span>Adjust your filters or create a clinic mapping.</span></div></td></tr>';
    return;
  }
  const query = new URLSearchParams(filters).toString();
  body.innerHTML = rows.map((row) => `<tr>
    <td><div class="entity-cell"><span>${escapeHtml(row.name.charAt(0))}</span><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.timezone)}</small></div></div></td>
    <td>${number(row.newLeads)}</td><td>${number(row.outboundDials)}</td><td>${number(row.answeredCalls)}</td><td>${number(row.conversations)}</td><td><strong>${number(row.validBookings)}</strong></td>
    <td><span class="performance-pill ${row.leadToBookingRate > 0 ? 'positive' : 'neutral'}">${percent(row.leadToBookingRate)}</span></td>
    <td>${percent(row.conversationToBookingRate)}</td><td>${Number(row.dialsPerLead || 0).toFixed(2)}</td><td>${percent(row.conversationRate)}</td><td>${speed(row.averageSpeedToLeadSeconds)}</td><td>${duration(row.talkTimeSeconds)}</td><td>${percent(row.talkTimeUtilization)}</td><td>${duration(row.averageTalkTimePerConversation)}</td><td>${duration(row.totalGapTimeSeconds)}</td>
    <td><a class="btn btn-sm btn-light details-button" href="/clinics/${encodeURIComponent(row.clinicId)}?${query}" aria-label="View ${escapeHtml(row.name)} details"><i class="bi bi-arrow-up-right"></i></a></td>
  </tr>`).join('');
}

async function load() {
  const signal = manager.next();
  skeleton();
  clearAlert();
  try {
    const response = await getMetrics('clinics', { ...filters, ...state }, signal);
    currentRows = response.data;
    renderRows(currentRows);
    const pagination = response.summary.pagination;
    document.querySelector('[data-table-count]').textContent = `${number(pagination.total)} clinic${pagination.total === 1 ? '' : 's'}`;
    renderPagination(document.querySelector('[data-pagination]'), pagination, (page) => { state.page = page; load(); });
  } catch (error) {
    if (error.name !== 'AbortError') showAlert(error.message);
  }
}

document.querySelector('[data-table-search]').addEventListener('input', debounce((event) => { state.search = event.target.value.trim(); state.page = 1; load(); }));
document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.sort;
  state.sortOrder = state.sortBy === key && state.sortOrder === 'asc' ? 'desc' : 'asc';
  state.sortBy = key;
  state.page = 1;
  load();
}));
document.querySelector('[data-export]').addEventListener('click', () => downloadCsv('clinic-performance.csv', [
  { label: 'Clinic', value: (row) => row.name }, { label: 'Leads', value: (row) => row.newLeads },
  { label: 'Dials', value: (row) => row.outboundDials }, { label: 'Answered', value: (row) => row.answeredCalls },
  { label: 'Conversations', value: (row) => row.conversations }, { label: 'Bookings', value: (row) => row.validBookings },
  { label: 'Lead conversion', value: (row) => percent(row.leadToBookingRate) },
  { label: 'Conversation conversion', value: (row) => percent(row.conversationToBookingRate) },
  { label: 'Dials per lead', value: (row) => row.dialsPerLead }, { label: 'Conversation rate', value: (row) => percent(row.conversationRate) },
  { label: 'Average speed', value: (row) => speed(row.averageSpeedToLeadSeconds) }, { label: 'Talk time', value: (row) => duration(row.talkTimeSeconds) },
  { label: 'Talk utilization', value: (row) => percent(row.talkTimeUtilization) },
  { label: 'Average talk per conversation', value: (row) => duration(row.averageTalkTimePerConversation) },
  { label: 'Gap time', value: (row) => duration(row.totalGapTimeSeconds) },
], currentRows));

initializeFilters({ onChange: (nextFilters) => { filters = nextFilters; state.page = 1; load(); } });
