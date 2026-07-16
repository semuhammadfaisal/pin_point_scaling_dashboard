jest.mock('../models/Clinic', () => ({ create: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../services/auditService', () => ({ recordAudit: jest.fn().mockResolvedValue(null) }));

const Clinic = require('../models/Clinic');
const { recordAudit } = require('../services/auditService');
const controller = require('../controllers/settingsController');

function request(body = {}, params = {}) {
  return { body, params, session: { admin: { id: '507f1f77bcf86cd799439011', email: 'admin@example.com' } }, ip: '127.0.0.1', get: () => 'Jest' };
}

function response() {
  return { redirect: jest.fn((location) => location) };
}

test('clinic creation persists campaign/group mapping and writes an audit event', async () => {
  Clinic.create.mockResolvedValue({ _id: 'clinic-1', name: 'North Clinic', hotProspectorCampaignId: 'campaign-4', hotProspectorGroupId: 'group-2', timezone: 'America/Chicago' });
  const req = request({ name: 'North Clinic', slug: 'north-clinic', hotProspectorCampaignId: 'campaign-4', hotProspectorGroupId: 'group-2', timezone: 'America/Chicago', active: 'true' });
  const res = response();
  await controller.createClinic(req, res);
  expect(Clinic.create).toHaveBeenCalledWith(expect.objectContaining({ hotProspectorCampaignId: 'campaign-4', hotProspectorGroupId: 'group-2' }));
  expect(recordAudit).toHaveBeenCalledWith(req, 'clinic_mapping_change', expect.objectContaining({ targetId: 'clinic-1' }));
  expect(res.redirect).toHaveBeenCalledWith('/settings/clinics');
});
