jest.mock('connect-mongo', () => ({ create: () => new (require('express-session').MemoryStore)() }));
jest.mock('../services/auditService', () => ({ recordAudit: jest.fn().mockResolvedValue(null) }));
jest.mock('../services/authService', () => ({ authenticateAdmin: jest.fn() }));

const request = require('supertest');
const { authenticateAdmin } = require('../services/authService');
const app = require('../server');

function csrfFrom(html) {
  return html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1];
}

test('health endpoint is public and protected dashboard redirects to login', async () => {
  await request(app).get('/health').expect(200).expect('Content-Type', /json/);
  const response = await request(app).get('/dashboard').expect(302);
  expect(response.headers.location).toBe('/login');
  await request(app).get('/api/reports/preview').expect(401);
});

test('readiness reports unavailable when the test process has no database connection', async () => {
  const response = await request(app).get('/ready').expect(503);
  expect(response.body.status).toBe('not_ready');
});

test('authentication uses a generic failure and regenerates into an authenticated session', async () => {
  const failedAgent = request.agent(app);
  let loginPage = await failedAgent.get('/login').expect(200);
  let csrf = csrfFrom(loginPage.text);
  authenticateAdmin.mockResolvedValueOnce(null);
  const failure = await failedAgent.post('/login').type('form').send({ _csrf: csrf, email: 'unknown@example.com', password: 'WrongPass!123' }).expect(401);
  expect(failure.text).toContain('The email or password is incorrect.');

  const agent = request.agent(app);
  loginPage = await agent.get('/login').expect(200);
  csrf = csrfFrom(loginPage.text);
  authenticateAdmin.mockResolvedValueOnce({ _id: '507f1f77bcf86cd799439011', id: '507f1f77bcf86cd799439011', name: 'Admin', email: 'admin@example.com' });
  const success = await agent.post('/login').type('form').send({ _csrf: csrf, email: 'admin@example.com', password: 'StrongPass!123' }).expect(302);
  expect(success.headers.location).toBe('/dashboard');
});

test('unknown routes use the custom error handling path', async () => {
  const response = await request(app).get('/does-not-exist').expect(404);
  expect(response.text).toContain('Page not found');
});
