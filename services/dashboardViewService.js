const Clinic = require('../models/Clinic');
const CSR = require('../models/CSR');
const Call = require('../models/Call');

async function getFilterOptions() {
  const [clinics, csrs, campaignIds] = await Promise.all([
    Clinic.find({ reportingVisible: { $ne: false } }).select('name active').sort({ name: 1 }).lean(),
    CSR.find().select('name email clinicIds active').sort({ name: 1 }).lean(),
    Call.distinct('campaignId', { campaignId: { $nin: ['', '0'] } }),
  ]);
  const campaigns = [...new Set(campaignIds.filter(Boolean))]
    .sort()
    .map((id) => ({ id, name: `Campaign ${id}` }));
  return {
    clinics: clinics.map((clinic) => ({ id: String(clinic._id), name: clinic.name, active: clinic.active })),
    csrs: csrs.map((csr) => ({
      id: String(csr._id),
      name: csr.name,
      email: csr.email,
      active: csr.active,
      clinicIds: csr.clinicIds.map(String),
    })),
    campaigns,
  };
}

module.exports = { getFilterOptions };
