const { normalizeCall, strictBoolean } = require('../services/v2Normalizer');
const { derivedMetrics } = require('../services/metricContractService');
const { sanitize } = require('../services/v2PayloadService');
const { localDateRange } = require('../utils/date');
const { summarize } = require('../services/metricsV2Service');
const { compare } = require('../services/v2ReconciliationService');
const { hash } = require('../services/v2PayloadService');

const mapping = { clinicId: '507f1f77bcf86cd799439011', timezone: 'America/Chicago' };
const snapshotId = '507f191e810c19729de860ea';

test('false-like external values never become true conversations', () => {
  expect(strictBoolean('0')).toBe(false);
  expect(strictBoolean('false')).toBe(false);
  expect(strictBoolean('no')).toBe(false);
  expect(strictBoolean('unknown')).toBeNull();
});

test('completed calls are not assumed answered before the threshold contract is verified', () => {
  const result = normalizeCall({
    recordingId: 'call-1', LeadId: 'lead-1', call_type: 'outbound', call_status: 'completed',
    call_datetime: '2026-07-20 12:00:00', duration: '120',
  }, mapping, snapshotId, { answerThresholdVerified: false, answerThresholdSeconds: 35 });
  expect(result.answered).toBeNull();
  expect(result.conversation).toBeNull();
});

test('verified answer threshold uses a strict greater-than boundary', () => {
  const record = {
    recordingId: 'call-1', call_type: 'outbound', call_status: 'completed',
    call_datetime: '2026-07-20 12:00:00', duration: '35',
  };
  expect(normalizeCall(record, mapping, snapshotId, { answerThresholdVerified: true, answerThresholdSeconds: 35 }).answered).toBe(false);
  expect(normalizeCall({ ...record, duration: '36' }, mapping, snapshotId, { answerThresholdVerified: true, answerThresholdSeconds: 35 }).answered).toBe(true);
});

test('total duration is never substituted for missing talk time', () => {
  const result = normalizeCall({
    recordingId: 'call-1', call_type: 'outbound', call_status: 'completed',
    call_datetime: '2026-07-20 12:00:00', duration: '90',
  }, mapping, snapshotId);
  expect(result.durationSeconds).toBe(90);
  expect(result.talkTimeSeconds).toBeNull();
});

test('unsupported denominators return unavailable ratios instead of zero or infinity', () => {
  const result = derivedMetrics({
    newLeads: 10, validBookings: 2, answeredCalls: 5, outboundDials: 20,
    conversations: null, talkTimeSeconds: null, workingTimeSeconds: null,
  });
  expect(result.leadToBookingRate).toBe(20);
  expect(result.answerRate).toBe(25);
  expect(result.conversationRate).toBeNull();
  expect(result.talkTimeUtilization).toBeNull();
});

test('source snapshot sanitation removes secrets and hashes PII', () => {
  const result = sanitize({ Authorization: 'Bearer secret', email: 'person@example.com', nested: { phone: '+15551234567' } });
  expect(result.Authorization).toBe('[REDACTED]');
  expect(result.email).toMatch(/^\[HASH:/);
  expect(result.nested.phone).toMatch(/^\[HASH:/);
  expect(JSON.stringify(result)).not.toContain('person@example.com');
});

test('clinic-local half-open ranges handle daylight saving transitions', () => {
  const spring = localDateRange('2026-03-08', '2026-03-08', 'America/Chicago');
  const fall = localDateRange('2026-11-01', '2026-11-01', 'America/Chicago');
  expect((spring.end - spring.start) / 3600000).toBe(23);
  expect((fall.end - fall.start) / 3600000).toBe(25);
});

test('reconciliation records exact differences and stable hashes support idempotency', () => {
  expect(compare('outboundDials', 430, 429)).toEqual({
    metric: 'outboundDials', expected: 430, actual: 429, difference: -1, matches: false,
  });
  expect(hash({ b: 2, a: 1 })).toBe(hash({ a: 1, b: 2 }));
});

test('materialized daily facts summarize production-sized clinic history quickly', () => {
  const rows = Array.from({ length: 62 * 366 }, () => ({
    newLeads: 1, outboundDials: 2, answeredCalls: 1, decisionMakers: null,
    conversations: null, validBookings: 0, talkTimeSeconds: null,
    gapTimeSeconds: null, workingTimeSeconds: null, uniqueLeadsDialed: 1,
    speedToLeadTotalSeconds: 60, speedToLeadSampleSize: 1,
  }));
  const started = performance.now();
  const result = summarize(rows);
  expect(result.newLeads).toBe(62 * 366);
  expect(result.decisionMakers).toBeNull();
  expect(performance.now() - started).toBeLessThan(250);
});
