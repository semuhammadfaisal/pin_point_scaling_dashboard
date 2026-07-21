const metricsService = require('../services/metricsFacadeService');
const { successResponse } = require('../utils/metricsResponse');

function endpoint(serviceMethod) {
  return async (req, res) => {
    const result = await serviceMethod(req.metricsFilters);
    if (res.locals.requestTimedOut || res.writableEnded) return;
    res.set('Cache-Control', 'no-store');
    res.json(successResponse(req.metricsFilters, result.summary, result.data, result.meta));
  };
}

module.exports = {
  overview: endpoint(metricsService.getOverview),
  trends: endpoint(metricsService.getTrends),
  clinics: endpoint(metricsService.getClinics),
  clinic: endpoint(metricsService.getClinic),
  csrs: endpoint(metricsService.getCsrs),
  csr: endpoint(metricsService.getCsr),
  bookingRatios: endpoint(metricsService.getBookingRatios),
  speedToLead: endpoint(metricsService.getSpeedToLead),
  callEfficiency: endpoint(metricsService.getCallEfficiency),
  talkTime: endpoint(metricsService.getTalkTime),
};
