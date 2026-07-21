const api = require('./hotProspectorApiService');
const { parseDuration } = require('../utils/date');
const { percentage } = require('./metricsFormulaService');

const CACHE_TTL_MS = 30000;
const MAX_DIRECT_DAYS = 31;
const CONCURRENCY = 6;
const cache = new Map();

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function nullablePercent(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace('%', '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeAgentRow(row = {}) {
  const talkMinutes = nullableNumber(row.talkMin);
  const conversations = nullableNumber(row.convos);
  const hours = row.hours === null || row.hours === undefined || row.hours === '' ? null : parseDuration(row.hours);
  const gap = row.gapTime === null || row.gapTime === undefined || row.gapTime === '' ? null : parseDuration(row.gapTime);
  return {
    externalUserId: String(row.agentId ?? row.userId ?? row.UserId ?? row.id ?? ''),
    name: String(row.name ?? row.memberName ?? row.agentName ?? '').trim() || 'Unknown agent',
    talkTimeSeconds: talkMinutes === null ? null : Math.round(talkMinutes * 60),
    workingTimeSeconds: hours,
    gapTimeSeconds: gap,
    conversations,
    prospects: nullableNumber(row.Prospects),
    appointments: nullableNumber(row.Appts),
    bookingRatio: nullablePercent(row.ABR),
  };
}

function sumComplete(rows, field) {
  if (!rows.length || rows.some((row) => row[field] === null)) return null;
  return rows.reduce((sum, row) => sum + row[field], 0);
}

function summarizeAgentRows(rows) {
  const normalized = rows.map(normalizeAgentRow);
  const talkTimeSeconds = sumComplete(normalized, 'talkTimeSeconds');
  const workingTimeSeconds = sumComplete(normalized, 'workingTimeSeconds');
  const totalGapTimeSeconds = sumComplete(normalized, 'gapTimeSeconds');
  const conversations = sumComplete(normalized, 'conversations');
  return {
    talkTimeSeconds,
    workingTimeSeconds,
    totalGapTimeSeconds,
    conversations,
    talkTimeUtilization: talkTimeSeconds === null || workingTimeSeconds === null || workingTimeSeconds === 0
      ? null
      : percentage(talkTimeSeconds, workingTimeSeconds),
    averageTalkTimePerConversation: talkTimeSeconds === null || conversations === null || conversations === 0
      ? null
      : Math.round(talkTimeSeconds / conversations),
    agents: normalized,
  };
}

function aggregateAgents(rows) {
  const agents = new Map();
  for (const row of rows.map(normalizeAgentRow)) {
    const key = row.externalUserId || row.name;
    const current = agents.get(key) || {
      externalUserId: row.externalUserId, name: row.name, talkTimeSeconds: null, workingTimeSeconds: null,
      gapTimeSeconds: null, conversations: null, prospects: null, appointments: null, bookingRatio: null,
    };
    for (const field of ['talkTimeSeconds', 'workingTimeSeconds', 'gapTimeSeconds', 'conversations', 'prospects', 'appointments']) {
      if (row[field] !== null) current[field] = (current[field] || 0) + row[field];
    }
    current.bookingRatio = row.bookingRatio ?? current.bookingRatio;
    agents.set(key, current);
  }
  return [...agents.values()].map((agent) => ({
    ...agent,
    bookingRatio: agent.bookingRatio ?? percentage(agent.appointments, agent.prospects),
  }));
}

function dateStrings(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dates = [];
  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

async function mapWithConcurrency(values, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, run));
  return output;
}

async function fetchDate(date) {
  const existing = cache.get(date);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const record = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    promise: api.fetchMemberDashboardData(date),
  };
  cache.set(date, record);
  record.promise.catch(() => {
    if (cache.get(date) === record) cache.delete(date);
  });
  return record.promise;
}

async function getAgentMetrics(filters) {
  const dates = dateStrings(filters.startDate, filters.endDate);
  if (!dates.length || dates.length > MAX_DIRECT_DAYS) {
    const error = new Error(`Verified agent metrics support ranges up to ${MAX_DIRECT_DAYS} days.`);
    error.code = 'HOT_PROSPECTOR_AGENT_RANGE_UNSUPPORTED';
    throw error;
  }
  const dailyRows = await mapWithConcurrency(dates, async (date) => ({ date, rows: await fetchDate(date) }));
  const rows = dailyRows.flatMap(({ date, rows: agents }) => agents.map((agent) => ({ ...agent, metricDate: date })));
  const summary = summarizeAgentRows(rows);
  return {
    ...summary,
    fetchedAt: new Date(),
    days: dates.length,
    data: aggregateAgents(rows),
  };
}

module.exports = { getAgentMetrics, normalizeAgentRow, summarizeAgentRows, aggregateAgents, dateStrings };
