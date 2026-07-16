const { calculateFromRecords } = require('../services/metricsFormulaService');
const { parseExternalDate } = require('../utils/date');

const clinicA = 'clinic-a';
const clinicB = 'clinic-b';
const csrA = 'csr-a';

function lead(id, clinicId = clinicA, createdAt = '2026-01-01T12:00:00.000Z') {
  return { _id: id, externalLeadId: `external-${id}`, clinicId, assignedCsrId: csrA, createdAtExternal: new Date(createdAt) };
}

function call(id, leadId, overrides = {}) {
  return {
    _id: id,
    externalCallId: `external-${id}`,
    clinicId: clinicA,
    csrId: csrA,
    leadId,
    direction: 'outbound',
    answered: true,
    conversation: true,
    startedAt: new Date('2026-01-01T12:01:00.000Z'),
    talkTimeSeconds: 30,
    ...overrides,
  };
}

function appointment(id, status = 'booked', clinicId = clinicA) {
  return { _id: id, externalAppointmentId: `external-${id}`, clinicId, bookedByCsrId: csrA, status };
}

test('zero leads produces finite zero conversion and speed metrics', () => {
  const result = calculateFromRecords();
  expect(result.newLeads).toBe(0);
  expect(result.leadToBookingRate).toBe(0);
  expect(result.averageSpeedToLeadSeconds).toBe(0);
  expect(result.medianSpeedToLeadSeconds).toBe(0);
});

test('zero calls produces zero call efficiency metrics', () => {
  const result = calculateFromRecords({ leads: [lead('lead-1')] });
  expect(result.outboundDials).toBe(0);
  expect(result.answerRate).toBe(0);
  expect(result.dialsPerLead).toBe(0);
  expect(result.talkTimeUtilization).toBe(0);
});

test('zero conversations does not divide bookings by zero', () => {
  const result = calculateFromRecords({
    leads: [lead('lead-1')],
    calls: [call('call-1', 'lead-1', { conversation: false })],
    appointments: [appointment('appointment-1')],
  });
  expect(result.validBookings).toBe(1);
  expect(result.conversationToBookingRate).toBe(0);
  expect(result.averageTalkTimePerConversation).toBe(0);
});

test('cancelled, deleted, and no-show appointments are excluded', () => {
  const result = calculateFromRecords({
    leads: [lead('lead-1')],
    appointments: [
      appointment('booked', 'booked'),
      appointment('cancelled', 'cancelled'),
      appointment('deleted', 'deleted'),
      appointment('no-show', 'no-show'),
    ],
  });
  expect(result.validBookings).toBe(1);
  expect(result.leadToBookingRate).toBe(100);
});

test('duplicate external calls are counted once', () => {
  const duplicate = call('call-1', 'lead-1');
  const result = calculateFromRecords({
    leads: [lead('lead-1')],
    calls: [duplicate, { ...duplicate, _id: 'duplicate-document' }],
  });
  expect(result.outboundDials).toBe(1);
  expect(result.conversations).toBe(1);
  expect(result.talkTimeSeconds).toBe(30);
});

test('leads without a first outbound dial are excluded from speed samples', () => {
  const result = calculateFromRecords({ leads: [lead('lead-1')] });
  expect(result.speedSampleSize).toBe(0);
  expect(result.contactedWithin1Minute).toBe(0);
});

test('calls without a lead count as dials but not unique leads dialed', () => {
  const result = calculateFromRecords({ calls: [call('call-1', null)] });
  expect(result.outboundDials).toBe(1);
  expect(result.uniqueLeadsDialed).toBe(0);
  expect(result.dialsPerLead).toBe(0);
});

test('multiple clinics remain isolated by clinic filter', () => {
  const result = calculateFromRecords({
    leads: [lead('lead-a', clinicA), lead('lead-b', clinicB)],
    calls: [call('call-a', 'lead-a'), call('call-b', 'lead-b', { clinicId: clinicB })],
    appointments: [appointment('appointment-a', 'confirmed', clinicA), appointment('appointment-b', 'scheduled', clinicB)],
    clinicId: clinicA,
  });
  expect(result.newLeads).toBe(1);
  expect(result.outboundDials).toBe(1);
  expect(result.validBookings).toBe(1);
});

test('different clinic timezones convert local dates to correct UTC instants', () => {
  const chicago = parseExternalDate('2026-06-23 18:00:00', 'America/Chicago');
  const karachi = parseExternalDate('2026-06-23 18:00:00', 'Asia/Karachi');
  expect(chicago.toISOString()).toBe('2026-06-23T23:00:00.000Z');
  expect(karachi.toISOString()).toBe('2026-06-23T13:00:00.000Z');
  expect(chicago.getTime()).not.toBe(karachi.getTime());
});

test('default formulas calculate speed thresholds and utilization', () => {
  const result = calculateFromRecords({
    leads: [lead('lead-1'), lead('lead-2', clinicA, '2026-01-01T12:00:00.000Z')],
    calls: [
      call('call-1', 'lead-1', { startedAt: new Date('2026-01-01T12:00:30.000Z'), talkTimeSeconds: 60 }),
      call('call-2', 'lead-2', { startedAt: new Date('2026-01-01T12:10:00.000Z'), answered: false, conversation: false, talkTimeSeconds: 0 }),
    ],
    appointments: [appointment('appointment-1', 'confirmed')],
    workingTimeSeconds: 600,
    gapTimeSeconds: 120,
  });
  expect(result.averageSpeedToLeadSeconds).toBe(315);
  expect(result.medianSpeedToLeadSeconds).toBe(315);
  expect(result.contactedWithin1Minute).toBe(50);
  expect(result.contactedWithin5Minutes).toBe(50);
  expect(result.contactedWithin15Minutes).toBe(100);
  expect(result.answerRate).toBe(50);
  expect(result.talkTimeUtilization).toBe(10);
  expect(result.averageTalkTimePerConversation).toBe(60);
  expect(result.totalGapTimeSeconds).toBe(120);
});
