jest.mock('../services/hotProspectorClient', () => ({ request: jest.fn() }));

const client = require('../services/hotProspectorClient');
const api = require('../services/hotProspectorApiService');

test('pagination verifies total_records and unique record coverage', async () => {
  client.request
    .mockResolvedValueOnce({ Results: [{ recordingId: '1' }, { recordingId: '2' }], total_records: 3, has_more: true, next_offset: 2 })
    .mockResolvedValueOnce({ Results: [{ recordingId: '3' }], total_records: 3, has_more: false, next_offset: 3 });
  const result = await api.fetchPaginatedWithMeta('userCallLogs', {}, { limit: 2 });
  expect(result.complete).toBe(true);
  expect(result.records).toHaveLength(3);
  expect(result.metadata.pagesFetched).toBe(2);
});

test('duplicate pages are marked incomplete', async () => {
  const page = { Results: [{ recordingId: '1' }], total_records: 2, has_more: true, next_offset: 1 };
  client.request.mockResolvedValue(page);
  const result = await api.fetchPaginatedWithMeta('userCallLogs', {}, { limit: 1, maxPages: 3 });
  expect(result.complete).toBe(false);
  expect(result.metadata.duplicatePage).toBe(true);
});
