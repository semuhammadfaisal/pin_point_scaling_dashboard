const mongoose = require('mongoose');
const env = require('../config/env');
const { errorResponse } = require('../utils/metricsResponse');

const PERIODS = new Set(['daily', 'weekly', 'monthly']);
const SORT_FIELDS = new Set([
  'name', 'clinic', 'newLeads', 'validBookings', 'leadToBookingRate', 'conversationToBookingRate',
  'outboundDials', 'answerRate', 'conversationRate', 'averageSpeedToLeadSeconds', 'talkTimeUtilization',
  'dialsPerLead', 'averageDialsPerLead', 'talkTimeSeconds', 'totalGapTimeSeconds',
  'averageTalkTimePerConversation', 'answeredCalls', 'conversations',
]);

function validDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function validateMetricsQuery(req, res, next) {
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.getTime() - (env.metrics.defaultRangeDays - 1) * 86400000).toISOString().slice(0, 10);
  const startDate = String(req.query.startDate || defaultStart);
  const endDate = String(req.query.endDate || defaultEnd);
  const clinicId = String(req.query.clinicId || req.query.clinic || req.params.clinicId || '').trim();
  const csrId = String(req.query.csrId || req.query.csr || req.params.csrId || '').trim();
  const period = String(req.query.period || 'daily').toLowerCase();
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 25);
  const sortBy = String(req.query.sortBy || 'name');
  const sortOrder = String(req.query.sortOrder || 'asc').toLowerCase();
  const campaignId = String(req.query.campaignId || req.query.campaign || '').trim();
  const groupId = String(req.query.groupId || req.query.group || '').trim();
  const errors = [];

  if (!validDateString(startDate)) errors.push({ field: 'startDate', message: 'startDate must use YYYY-MM-DD.' });
  if (!validDateString(endDate)) errors.push({ field: 'endDate', message: 'endDate must use YYYY-MM-DD.' });
  if (validDateString(startDate) && validDateString(endDate)) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const rangeDays = Math.floor((end - start) / 86400000) + 1;
    if (end < start) errors.push({ field: 'endDate', message: 'endDate must be on or after startDate.' });
    if (rangeDays > env.metrics.maxRangeDays) {
      errors.push({ field: 'dateRange', message: `Date range cannot exceed ${env.metrics.maxRangeDays} days.` });
    }
  }
  if (clinicId && !mongoose.isValidObjectId(clinicId)) errors.push({ field: 'clinicId', message: 'clinicId is invalid.' });
  if (csrId && !mongoose.isValidObjectId(csrId)) errors.push({ field: 'csrId', message: 'csrId is invalid.' });
  if (!PERIODS.has(period)) errors.push({ field: 'period', message: 'period must be daily, weekly, or monthly.' });
  if (!Number.isInteger(page) || page < 1) errors.push({ field: 'page', message: 'page must be a positive integer.' });
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) errors.push({ field: 'limit', message: 'limit must be between 1 and 100.' });
  if (!SORT_FIELDS.has(sortBy)) errors.push({ field: 'sortBy', message: 'sortBy is not supported.' });
  if (!['asc', 'desc'].includes(sortOrder)) errors.push({ field: 'sortOrder', message: 'sortOrder must be asc or desc.' });
  if (campaignId.length > 200) errors.push({ field: 'campaignId', message: 'campaignId is too long.' });
  if (groupId.length > 200) errors.push({ field: 'groupId', message: 'groupId is too long.' });

  if (errors.length) return res.status(400).json(errorResponse(req.query, 'VALIDATION_ERROR', 'Invalid metrics filters.', errors));

  req.metricsFilters = {
    startDate,
    endDate,
    clinicId: clinicId || null,
    csrId: csrId || null,
    campaignId: campaignId || null,
    groupId: groupId || null,
    period,
    page,
    limit,
    sortBy,
    sortOrder,
    search: String(req.query.search || '').trim().slice(0, 100),
  };
  return next();
}

module.exports = validateMetricsQuery;
