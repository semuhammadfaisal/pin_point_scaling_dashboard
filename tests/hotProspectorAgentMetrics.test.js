const {
  normalizeAgentRow,
  summarizeAgentRows,
  aggregateAgents,
  dateStrings,
} = require('../services/hotProspectorAgentMetricsService');

test('normalizes explicit Hot Prospector agent duration and booking fields', () => {
  expect(normalizeAgentRow({ agentId: 7, agentName: 'Agent', talkMin: '92', hours: '02h :26m :34s', gapTime: '20m :54s', convos: '12', Prospects: '20', Appts: '3', ABR: '15%' }))
    .toMatchObject({ externalUserId: '7', name: 'Agent', talkTimeSeconds: 5520, workingTimeSeconds: 8794, gapTimeSeconds: 1254, conversations: 12, prospects: 20, appointments: 3, bookingRatio: 15 });
});

test('aggregates repeated daily agent booking rows', () => {
  const rows = aggregateAgents([
    { agentId: 7, agentName: 'Agent', talkMin: 10, hours: '1h', gapTime: '5m', convos: 2, Prospects: 10, Appts: 1, ABR: '10%' },
    { agentId: 7, agentName: 'Agent', talkMin: 20, hours: '2h', gapTime: '6m', convos: 3, Prospects: 20, Appts: 2, ABR: '10%' },
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: 'Agent', prospects: 30, appointments: 3, conversations: 5, talkTimeSeconds: 1800 });
});

test('calculates verified talk, gap, utilization, and average talk metrics', () => {
  const result = summarizeAgentRows([
    { talkMin: 92, hours: '02h :26m :34s', gapTime: '20m :54s', convos: 12 },
    { talkMin: 94, hours: '02h :44m :36s', gapTime: '00m :00s', convos: 8 },
    { talkMin: 37, hours: '02h :17m :54s', gapTime: '11m :44s', convos: 4 },
  ]);
  expect(result.talkTimeSeconds).toBe(13380);
  expect(result.workingTimeSeconds).toBe(26944);
  expect(result.totalGapTimeSeconds).toBe(1958);
  expect(result.conversations).toBe(24);
  expect(result.talkTimeUtilization).toBe(49.66);
  expect(result.averageTalkTimePerConversation).toBe(558);
});

test('does not turn missing source fields into zero', () => {
  const result = summarizeAgentRows([{ hours: '1h', gapTime: '5m', convos: 0 }]);
  expect(result.talkTimeSeconds).toBeNull();
  expect(result.talkTimeUtilization).toBeNull();
  expect(result.averageTalkTimePerConversation).toBeNull();
});

test('builds inclusive date ranges', () => {
  expect(dateStrings('2026-07-20', '2026-07-22')).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
});
