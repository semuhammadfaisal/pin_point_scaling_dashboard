function validDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function timeZoneOffset(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const asUtc = Date.UTC(values.year, Number(values.month) - 1, values.day, values.hour, values.minute, values.second);
    return asUtc - date.getTime();
  } catch (_error) {
    return 0;
  }
}

function parseExternalDate(value, timeZone = 'UTC') {
  if (!value) return null;
  if (value instanceof Date) return validDate(value);
  if (typeof value === 'number') return validDate(new Date(value < 1e12 ? value * 1000 : value));

  const text = String(value).trim();
  if (!text) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) return validDate(new Date(text));

  const direct = validDate(new Date(text));
  if (!direct) return null;
  const naiveUtc = new Date(Date.UTC(
    direct.getFullYear(),
    direct.getMonth(),
    direct.getDate(),
    direct.getHours(),
    direct.getMinutes(),
    direct.getSeconds(),
    direct.getMilliseconds()
  ));
  const candidate = new Date(naiveUtc.getTime() - timeZoneOffset(naiveUtc, timeZone));
  const refined = new Date(naiveUtc.getTime() - timeZoneOffset(candidate, timeZone));
  return validDate(refined);
}

function formatApiDate(date, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function localDateRange(startDate, endDate, timeZone = 'UTC') {
  const start = parseExternalDate(`${startDate}T00:00:00`, timeZone);
  const endBoundary = new Date(`${endDate}T00:00:00.000Z`);
  endBoundary.setUTCDate(endBoundary.getUTCDate() + 1);
  const exclusiveEnd = parseExternalDate(`${endBoundary.toISOString().slice(0, 10)}T00:00:00`, timeZone);
  if (!start || !exclusiveEnd) throw new Error(`Unable to build date range for timezone ${timeZone}.`);
  return { start, end: exclusiveEnd };
}

function parseDuration(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (Number.isFinite(Number(value))) return Math.max(0, Math.round(Number(value)));
  const text = String(value).toLowerCase();
  const hours = Number(text.match(/(\d+)\s*h/)?.[1] || 0);
  const minutes = Number(text.match(/(\d+)\s*m/)?.[1] || 0);
  const seconds = Number(text.match(/(\d+)\s*s/)?.[1] || 0);
  if (hours || minutes || seconds) return hours * 3600 + minutes * 60 + seconds;
  const segments = text.split(':').map(Number);
  if (segments.every(Number.isFinite)) {
    if (segments.length === 3) return segments[0] * 3600 + segments[1] * 60 + segments[2];
    if (segments.length === 2) return segments[0] * 60 + segments[1];
  }
  return 0;
}

module.exports = { parseExternalDate, formatApiDate, startOfUtcDay, localDateRange, parseDuration };
