const validateMetricsQuery = require('../middleware/metricsValidation');
const validateReport = require('../middleware/reportValidation');

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; }, send(payload) { this.payload = payload; return this; } };
}

test('metrics filters normalize valid query parameters', () => {
  const req = { query: { startDate: '2026-07-01', endDate: '2026-07-17', period: 'daily', page: '2', limit: '25' }, params: {} };
  const res = response();
  const next = jest.fn();
  validateMetricsQuery(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  expect(req.metricsFilters.page).toBe(2);
  expect(req.metricsFilters.startDate).toBe('2026-07-01');
});

test('metrics filters default to the current day', () => {
  const req = { query: {}, params: {} };
  const res = response();
  const next = jest.fn();
  validateMetricsQuery(req, res, next);
  const today = new Date().toISOString().slice(0, 10);
  expect(next).toHaveBeenCalledTimes(1);
  expect(req.metricsFilters.startDate).toBe(today);
  expect(req.metricsFilters.endDate).toBe(today);
});

test('date range validation rejects reversed and excessive ranges', () => {
  const req = { query: { startDate: '2024-01-01', endDate: '2026-07-17' }, params: {} };
  const res = response();
  validateMetricsQuery(req, res, jest.fn());
  expect(res.statusCode).toBe(400);
  expect(res.payload.error.code).toBe('VALIDATION_ERROR');
  expect(res.payload.error.details.some((item) => item.field === 'dateRange')).toBe(true);
});

test('report validation accepts supported types and rejects unknown types', () => {
  const validReq = { query: { reportType: 'speed-to-lead' }, path: '/api/reports/preview' };
  const next = jest.fn();
  validateReport(validReq, response(), next);
  expect(validReq.reportType).toBe('speed-to-lead');
  expect(next).toHaveBeenCalled();

  const invalidRes = response();
  validateReport({ query: { reportType: 'unsafe' }, path: '/api/reports/preview' }, invalidRes, jest.fn());
  expect(invalidRes.statusCode).toBe(400);
});
