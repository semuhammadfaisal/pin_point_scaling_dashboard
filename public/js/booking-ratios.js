import { createRequestManager, getMetrics } from './api.js';
import { initializeFilters } from './filters.js';
import { clearAlert, debounce, downloadCsv, escapeHtml, number, percent, renderPagination, showAlert } from './formatters.js';

const manager = createRequestManager();
let filters = {};
let allRows = [];
let state = { page: 1, limit: 25, search: '' };

function renderMatrix(rows) {
  const clinics = [...new Map(rows.map((row) => [row.clinicId, row.clinicName])).entries()];
  const csrs = [...new Map(rows.map((row) => [row.csrId, row.csrName])).entries()];
  document.querySelector('[data-matrix-head]').innerHTML = `<tr><th>CSR</th>${clinics.map(([, name]) => `<th>${escapeHtml(name)}</th>`).join('')}</tr>`;
  const body = document.querySelector('[data-matrix-body]');
  if (!rows.length) {
    body.innerHTML = '<tr><td><div class="table-empty"><i class="bi bi-grid-3x3-gap"></i><strong>No booking ratios</strong><span>Map clinics and synchronize CSR data first.</span></div></td></tr>';
    return;
  }
  body.innerHTML = csrs.map(([csrId, csrName]) => `<tr><th>${escapeHtml(csrName)}</th>${clinics.map(([clinicId]) => {
    const cell = rows.find((row) => row.csrId === csrId && row.clinicId === clinicId);
    if (!cell) return '<td class="matrix-empty">—</td>';
    const tone = cell.bookingRatio >= 30 ? 'high' : cell.bookingRatio > 0 ? 'medium' : 'low';
    return `<td><span class="ratio-cell ${tone}" tabindex="0" data-bs-toggle="tooltip" data-bs-title="${number(cell.newLeads)} leads · ${number(cell.conversations)} conversations · ${number(cell.bookings)} bookings">${percent(cell.bookingRatio)}</span></td>`;
  }).join('')}</tr>`).join('');
  if (window.bootstrap?.Tooltip) body.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => bootstrap.Tooltip.getOrCreateInstance(element));
}

function renderTable() {
  const search = state.search.toLowerCase();
  const filtered = allRows.filter((row) => !search || row.clinicName.toLowerCase().includes(search) || row.csrName.toLowerCase().includes(search));
  const pages = Math.max(1, Math.ceil(filtered.length / state.limit));
  state.page = Math.min(state.page, pages);
  const rows = filtered.slice((state.page - 1) * state.limit, state.page * state.limit);
  const body = document.querySelector('[data-table-body]');
  body.innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${escapeHtml(row.clinicName)}</strong></td><td>${escapeHtml(row.csrName)}</td><td>${number(row.newLeads)}</td><td>${number(row.conversations)}</td><td>${number(row.bookings)}</td><td>${percent(row.leadToBookingRate)}</td><td>${percent(row.bookingRatio)}</td></tr>`).join('') : '<tr><td colspan="7"><div class="table-empty"><strong>No matching ratios</strong></div></td></tr>';
  document.querySelector('[data-table-count]').textContent = `${number(filtered.length)} ratio row${filtered.length === 1 ? '' : 's'}`;
  renderPagination(document.querySelector('[data-pagination]'), { page: state.page, pages, total: filtered.length, limit: state.limit }, (page) => { state.page = page; renderTable(); });
}

async function load() {
  const signal = manager.next();
  clearAlert();
  try {
    const first = await getMetrics('booking-ratios', { ...filters, page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc' }, signal);
    allRows = [...first.data];
    const pages = first.summary.pagination?.pages || 1;
    for (let page = 2; page <= pages; page += 1) {
      const response = await getMetrics('booking-ratios', { ...filters, page, limit: 100, sortBy: 'name', sortOrder: 'asc' }, signal);
      allRows.push(...response.data);
    }
    renderMatrix(allRows);
    renderTable();
  } catch (error) {
    if (error.name !== 'AbortError') showAlert(error.message);
  }
}

document.querySelectorAll('[data-ratio-view]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-ratio-view]').forEach((item) => item.classList.toggle('active', item === button));
  const matrix = button.dataset.ratioView === 'matrix';
  document.querySelector('[data-matrix-view]').classList.toggle('d-none', !matrix);
  document.querySelector('[data-normal-view]').classList.toggle('d-none', matrix);
}));
document.querySelector('[data-table-search]').addEventListener('input', debounce((event) => { state.search = event.target.value.trim(); state.page = 1; renderTable(); }));
document.querySelector('[data-export]').addEventListener('click', () => downloadCsv('booking-ratios.csv', [
  { label: 'Clinic', value: (row) => row.clinicName }, { label: 'CSR', value: (row) => row.csrName },
  { label: 'Leads', value: (row) => row.newLeads }, { label: 'Conversations', value: (row) => row.conversations },
  { label: 'Bookings', value: (row) => row.bookings }, { label: 'Lead-to-booking', value: (row) => percent(row.leadToBookingRate) },
  { label: 'Conversation-to-booking', value: (row) => percent(row.bookingRatio) },
], allRows));

initializeFilters({ onChange: (next) => { filters = next; state.page = 1; load(); } });
