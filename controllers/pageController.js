const Clinic = require('../models/Clinic');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { getFilterOptions } = require('../services/dashboardViewService');

const pages = {
  clinics: {
    view: 'clinics/index',
    title: 'Clinics',
    pageTitle: 'Clinics',
    pageDescription: 'Manage locations and monitor clinic-level performance.',
  },
  csrPerformance: {
    view: 'csr-performance/index',
    title: 'CSR Performance',
    pageTitle: 'CSR performance',
    pageDescription: 'Track the outcomes and activity of your patient service team.',
  },
};

async function showClinics(_req, res) {
  res.render('clinics/index', {
    layout: 'layouts/main', ...pages.clinics, pageScript: '/js/clinics.js', filterOptions: await getFilterOptions(),
  });
}

async function showClinicDetails(req, res) {
  if (!mongoose.isValidObjectId(req.params.clinicId)) throw new AppError('Clinic not found.', 404);
  const clinic = await Clinic.findById(req.params.clinicId).select('name timezone').lean();
  if (!clinic) throw new AppError('Clinic not found.', 404);
  res.render('clinics/details', {
    layout: 'layouts/main',
    title: clinic.name,
    pageTitle: clinic.name,
    pageDescription: `Detailed performance reporting in ${clinic.timezone}.`,
    pageScript: '/js/clinic-details.js',
    filterOptions: await getFilterOptions(),
    clinic: { id: String(clinic._id), name: clinic.name, timezone: clinic.timezone },
  });
}

async function showCsrPerformance(_req, res) {
  res.render('csr-performance/index', {
    layout: 'layouts/main', ...pages.csrPerformance, pageScript: '/js/csr-performance.js', filterOptions: await getFilterOptions(),
  });
}

async function showBookingRatios(_req, res) {
  res.render('booking-ratios/index', {
    layout: 'layouts/main',
    title: 'Booking Ratios',
    pageTitle: 'Booking ratio matrix',
    pageDescription: 'Compare CSR booking performance across every clinic.',
    pageScript: '/js/booking-ratios.js',
    filterOptions: await getFilterOptions(),
  });
}

module.exports = {
  showClinics,
  showClinicDetails,
  showCsrPerformance,
  showBookingRatios,
};
