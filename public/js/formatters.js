const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const number = (value) => numberFormatter.format(Number(value || 0));
export const decimal = (value) => decimalFormatter.format(Number(value || 0));
export const percent = (value) => `${decimal(value)}%`;

export function duration(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
}

export function speed(value) {
  return duration(value);
}

export function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

export function debounce(callback, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}

export function downloadCsv(filename, columns, rows) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.map((column) => quote(column.label)).join(',')]
    .concat(rows.map((row) => columns.map((column) => quote(column.value(row))).join(',')))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function showAlert(message) {
  const alert = document.querySelector('[data-page-alert]');
  if (!alert) return;
  alert.className = 'dashboard-alert alert alert-danger';
  alert.innerHTML = `<i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
}

export function clearAlert() {
  document.querySelector('[data-page-alert]')?.classList.add('d-none');
}

export function renderPagination(container, pagination, onPage) {
  if (!container) return;
  container.innerHTML = '';
  if (!pagination || pagination.pages <= 1) return;
  const addButton = (label, page, disabled = false, active = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = disabled;
    button.className = active ? 'active' : '';
    button.setAttribute('aria-label', `Page ${label}`);
    if (active) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => onPage(page));
    container.append(button);
  };
  addButton('‹', pagination.page - 1, pagination.page === 1);
  const start = Math.max(1, pagination.page - 2);
  const end = Math.min(pagination.pages, start + 4);
  for (let page = start; page <= end; page += 1) addButton(String(page), page, false, page === pagination.page);
  addButton('›', pagination.page + 1, pagination.page === pagination.pages);
}

export function initializeTooltips(root = document) {
  if (!window.bootstrap?.Tooltip) return;
  root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((element) => bootstrap.Tooltip.getOrCreateInstance(element));
}
