import { createRequestManager, getMetrics } from './api.js';
import { initializeFilters } from './filters.js';
import { clearAlert, debounce, downloadCsv, duration, escapeHtml, number, percent, renderPagination, showAlert, speed } from './formatters.js';

const manager = createRequestManager();
let filters = {};
let state = { page: 1, limit: 25, search: '', sortBy: 'name', sortOrder: 'asc' };
let rows = [];

function render(data) {
  const body = document.querySelector('[data-table-body]');
  if (!data.length) {
    body.innerHTML = '<tr><td colspan="14"><div class="table-empty"><i class="bi bi-headset"></i><strong>No CSR performance data</strong><span>Synchronize agents or adjust the report filters.</span></div></td></tr>';
    return;
  }
  body.innerHTML = data.map((row) => `<tr>
    <td><div class="entity-cell"><span>${escapeHtml(row.name.charAt(0))}</span><div><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.email || '')}</small></div></div></td>
    <td>${escapeHtml(row.clinic || 'Not mapped')}</td><td>${number(row.outboundDials)}</td><td>${number(row.answeredCalls)}</td><td>${number(row.conversations)}</td><td><strong>${number(row.validBookings)}</strong></td>
    <td>${percent(row.answerRate)}</td><td>${percent(row.conversationRate)}</td><td><span class="performance-pill ${row.conversationToBookingRate > 0 ? 'positive' : 'neutral'}">${percent(row.conversationToBookingRate)}</span></td>
    <td>${duration(row.talkTimeSeconds)}</td><td>${percent(row.talkTimeUtilization)}</td><td>${duration(row.averageTalkTimePerConversation)}</td><td>${duration(row.totalGapTimeSeconds)}</td><td>${speed(row.averageSpeedToLeadSeconds)}</td>
  </tr>`).join('');
}

async function load() {
  const signal = manager.next();
  clearAlert();
  try {
    const response = await getMetrics('csrs', { ...filters, ...state }, signal);
    rows = response.data;
    render(rows);
    const pagination = response.summary.pagination;
    document.querySelector('[data-table-count]').textContent = `${number(pagination.total)} CSR${pagination.total === 1 ? '' : 's'}`;
    renderPagination(document.querySelector('[data-pagination]'), pagination, (page) => { state.page = page; load(); });
  } catch (error) {
    if (error.name !== 'AbortError') showAlert(error.message);
  }
}

document.querySelector('[data-table-search]').addEventListener('input', debounce((event) => { state.search = event.target.value.trim(); state.page = 1; load(); }));
document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
  state.sortOrder = state.sortBy === button.dataset.sort && state.sortOrder === 'asc' ? 'desc' : 'asc';
  state.sortBy = button.dataset.sort; state.page = 1; load();
}));
document.querySelector('[data-export]').addEventListener('click', () => downloadCsv('csr-performance.csv', [
  { label: 'CSR', value: (row) => row.name }, { label: 'Clinic', value: (row) => row.clinic },
  { label: 'Dials', value: (row) => row.outboundDials }, { label: 'Answered', value: (row) => row.answeredCalls },
  { label: 'Conversations', value: (row) => row.conversations }, { label: 'Bookings', value: (row) => row.validBookings },
  { label: 'Answer rate', value: (row) => percent(row.answerRate) }, { label: 'Conversation rate', value: (row) => percent(row.conversationRate) },
  { label: 'Booking ratio', value: (row) => percent(row.conversationToBookingRate) }, { label: 'Talk time', value: (row) => duration(row.talkTimeSeconds) },
  { label: 'Talk utilization', value: (row) => percent(row.talkTimeUtilization) },
  { label: 'Average talk per conversation', value: (row) => duration(row.averageTalkTimePerConversation) },
  { label: 'Gap time', value: (row) => duration(row.totalGapTimeSeconds) }, { label: 'Average speed', value: (row) => speed(row.averageSpeedToLeadSeconds) },
], rows));

initializeFilters({ onChange: (next) => { filters = next; state.page = 1; load(); } });
