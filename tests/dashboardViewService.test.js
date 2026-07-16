jest.mock('../models/Clinic', () => ({ find: jest.fn() }));
jest.mock('../models/CSR', () => ({ find: jest.fn() }));
jest.mock('../models/Call', () => ({ distinct: jest.fn() }));

const Clinic = require('../models/Clinic');
const CSR = require('../models/CSR');
const Call = require('../models/Call');
const { getFilterOptions } = require('../services/dashboardViewService');

function clinicQuery(rows) {
  return { select: () => ({ sort: () => ({ lean: () => Promise.resolve(rows) }) }) };
}

function csrQuery(rows) {
  return { select: () => ({ sort: () => ({ lean: () => Promise.resolve(rows) }) }) };
}

test('dashboard filter options use the trusted reporting visibility selector', async () => {
  Clinic.find.mockReturnValue(clinicQuery([{ _id: 'clinic-1', name: 'North Clinic', active: true }]));
  CSR.find.mockReturnValue(csrQuery([{ _id: 'csr-1', name: 'Alex', email: 'alex@example.com', active: true, clinicIds: ['clinic-1'] }]));
  Call.distinct.mockResolvedValue(['campaign-1']);

  const result = await getFilterOptions();

  expect(Clinic.find).toHaveBeenCalledWith({ reportingVisible: { $ne: false } });
  expect(result.clinics).toEqual([{ id: 'clinic-1', name: 'North Clinic', active: true }]);
  expect(result.campaigns).toEqual([{ id: 'campaign-1', name: 'Campaign campaign-1' }]);
});
