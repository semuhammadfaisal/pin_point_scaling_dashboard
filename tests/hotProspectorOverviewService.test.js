const { normalizeOverviewRecord } = require('../services/hotProspectorOverviewService');

test('normalizes the authoritative Hot Prospector overview response', () => {
  const result = normalizeOverviewRecord({
    total_calls: '2278',
    total_lead_campaign: '1019',
    total_answer: 530,
    mdm: '1651',
    total_appointment_overview: '54',
    Avg_speed: '9 h 2 m',
    averge_calls_per_lead: 2.2,
  });
  expect(result.outboundDials).toBe(2278);
  expect(result.newLeads).toBe(1019);
  expect(result.answeredCalls).toBe(530);
  expect(result.conversations).toBe(1651);
  expect(result.validBookings).toBe(54);
  expect(result.averageSpeedToLeadSeconds).toBe(32520);
  expect(result.averageDialsPerLead).toBe(2.2);
});
