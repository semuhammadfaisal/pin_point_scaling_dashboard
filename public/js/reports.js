import { createRequestManager } from './api.js';
import { escapeHtml, number, decimal, percent, duration, showAlert, clearAlert } from './formatters.js';

const builder = document.querySelector('[data-report-builder]');
const form = builder?.querySelector('[data-report-form]');
const requestManager = createRequestManager();

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaults() {
  const today = isoDate(new Date());
  return { startDate: today, endDate: today, clinicId: '', csrId: '', reportType: 'agency-daily' };
}

function filters() {
  return Object.fromEntries(new FormData(form).entries());
}

function setFilters(values) {
  Object.entries(values).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value || ''; });
  filterCsrs();
}

function readUrl() {
  const query = new URLSearchParams(location.search);
  const base = defaults();
  Object.keys(base).forEach((key) => { if (query.has(key)) base[key] = query.get(key); });
  return base;
}

function writeUrl(values) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
  history.replaceState({}, '', `${location.pathname}?${query}`);
}

function filterCsrs() {
  const clinicId = form.elements.clinicId.value;
  [...form.elements.csrId.options].forEach((option, index) => {
    if (!index) return;
    const allowed = !clinicId || (option.dataset.clinicIds || '').split(',').includes(clinicId);
    option.hidden = !allowed;
    option.disabled = !allowed;
  });
  if (form.elements.csrId.selectedOptions[0]?.disabled) form.elements.csrId.value = '';
}

function format(value, type) {
  if (type === 'percent') return percent(value);
  if (type === 'duration') return duration(value);
  if (type === 'number') return number(value);
  if (type === 'decimal') return decimal(value);
  return String(value ?? '—');
}

function setLoading() {
  builder.querySelector('[data-report-body]').innerHTML = Array.from({ length: 6 }, () => '<tr class="skeleton-row"><td colspan="20"><span></span></td></tr>').join('');
}

function render(payload) {
  const head = builder.querySelector('[data-report-head]');
  const body = builder.querySelector('[data-report-body]');
  head.innerHTML = `<tr>${payload.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>`;
  if (!payload.data.length) {
    body.innerHTML = `<tr><td colspan="${payload.columns.length}"><div class="report-empty"><i class="bi bi-inbox"></i><strong>No matching records</strong><span>Try a wider date range or different filters.</span></div></td></tr>`;
  } else {
    body.innerHTML = payload.data.map((row) => `<tr>${payload.columns.map((column) => `<td>${escapeHtml(format(row[column.key], column.dataType))}</td>`).join('')}</tr>`).join('');
  }
  const label = form.elements.reportType.selectedOptions[0].textContent;
  builder.querySelector('[data-preview-title]').textContent = label;
  builder.querySelector('[data-preview-summary]').textContent = `Showing ${payload.summary.previewRows} of ${payload.summary.totalRows} row(s). Exports include all rows.`;
  builder.querySelector('[data-report-generated]').textContent = `Generated ${new Date(payload.generatedAt).toLocaleString()}`;
}

async function loadPreview() {
  clearAlert();
  const values = filters();
  if (!form.reportValidity()) return;
  writeUrl(values);
  setLoading();
  try {
    const response = await fetch(`/api/reports/preview?${new URLSearchParams(values)}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: requestManager.next() });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'Unable to generate the report preview.');
    render(payload);
  } catch (error) {
    if (error.name !== 'AbortError') showAlert(error.message);
  }
}

if (form) {
  setFilters(readUrl());
  form.addEventListener('submit', (event) => { event.preventDefault(); loadPreview(); });
  form.elements.clinicId.addEventListener('change', filterCsrs);
  builder.querySelector('[data-report-reset]').addEventListener('click', () => { setFilters(defaults()); loadPreview(); });
  builder.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const query = new URLSearchParams(filters());
    window.location.assign(`/reports/export/${button.dataset.export}?${query}`);
  }));
  window.addEventListener('popstate', () => { setFilters(readUrl()); loadPreview(); });
  loadPreview();
}
