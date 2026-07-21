const { getFilterOptions } = require('../services/dashboardViewService');

async function showDashboard(_req, res) {
  const filterOptions = await getFilterOptions();
  res.render('dashboard/index', {
    layout: 'layouts/main',
    title: 'Dashboard',
    pageTitle: 'Performance overview',
    pageDescription: '',
    pageScript: '/js/dashboard.js',
    filterOptions,
  });
}

module.exports = { showDashboard };
