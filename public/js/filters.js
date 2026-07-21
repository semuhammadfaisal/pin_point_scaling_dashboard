function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultRange() {
  const today = new Date();
  const date = isoDate(today);
  return { startDate: date, endDate: date };
}

function quickRange(key) {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  if (key === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (key === 'last7') {
    start.setDate(start.getDate() - 6);
  } else if (key === 'thisMonth') {
    start.setDate(1);
  } else if (key === 'lastMonth') {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

export function initializeFilters({ onChange, lockedClinicId = null } = {}) {
  const panel = document.querySelector('[data-filter-bar]');
  const form = panel?.querySelector('[data-filter-form]');
  if (!form) return null;
  const controls = Object.fromEntries(['startDate', 'endDate', 'clinicId', 'csrId', 'campaignId'].map((name) => [name, form.elements[name]]));

  function readUrl() {
    const query = new URLSearchParams(location.search);
    const defaults = defaultRange();
    return {
      startDate: query.get('startDate') || defaults.startDate,
      endDate: query.get('endDate') || defaults.endDate,
      clinicId: lockedClinicId || query.get('clinicId') || '',
      csrId: query.get('csrId') || '',
      campaignId: query.get('campaignId') || '',
    };
  }

  function values() {
    return Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control?.value || '']));
  }

  function filterCsrs() {
    const clinicId = controls.clinicId.value;
    [...controls.csrId.options].forEach((option, index) => {
      if (index === 0) return;
      const clinicIds = option.dataset.clinicIds?.split(',').filter(Boolean) || [];
      option.hidden = Boolean(clinicId && !clinicIds.includes(clinicId));
      option.disabled = option.hidden;
    });
    if (controls.csrId.selectedOptions[0]?.disabled) controls.csrId.value = '';
  }

  function writeUrl(filters, mode = 'push') {
    const query = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const target = `${location.pathname}?${query.toString()}`;
    history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', target);
  }

  function updateSummary(filters) {
    const summary = panel.querySelector('[data-filter-summary]');
    if (summary) summary.textContent = `${filters.startDate} to ${filters.endDate}`;
  }

  function apply(filters, { historyMode = 'push', notify = true } = {}) {
    Object.entries(filters).forEach(([key, value]) => {
      if (controls[key]) controls[key].value = value || '';
    });
    if (lockedClinicId) {
      controls.clinicId.value = lockedClinicId;
      controls.clinicId.disabled = true;
    }
    filterCsrs();
    const current = values();
    if (lockedClinicId) current.clinicId = lockedClinicId;
    writeUrl(current, historyMode);
    updateSummary(current);
    if (notify) onChange?.(current);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    apply(values());
  });
  controls.clinicId.addEventListener('change', filterCsrs);
  panel.querySelector('[data-filter-reset]').addEventListener('click', () => apply({ ...defaultRange(), clinicId: lockedClinicId || '', csrId: '', campaignId: '' }));
  panel.querySelectorAll('[data-quick-range]').forEach((button) => button.addEventListener('click', () => {
    apply({ ...values(), ...quickRange(button.dataset.quickRange) });
  }));
  window.addEventListener('popstate', () => apply(readUrl(), { historyMode: 'replace' }));
  apply(readUrl(), { historyMode: 'replace' });
  return { getFilters: values, apply };
}
