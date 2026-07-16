const DailyAgentMetric = require('../models/DailyAgentMetric');
const mongoose = require('mongoose');
const metricsService = require('./metricsService');
const { getReportDefinition } = require('../config/reportDefinitions');

function nextDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

async function getCsrDaily(filters) {
  const match = {
    date: { $gte: new Date(`${filters.startDate}T00:00:00.000Z`), $lt: nextDate(filters.endDate) },
    ...(filters.clinicId ? { clinicId: new mongoose.Types.ObjectId(filters.clinicId) } : {}),
    ...(filters.csrId ? { csrId: new mongoose.Types.ObjectId(filters.csrId) } : {}),
  };
  return DailyAgentMetric.aggregate([
    { $match: match },
    { $lookup: { from: 'clinics', localField: 'clinicId', foreignField: '_id', as: 'clinic' } },
    { $lookup: { from: 'csrs', localField: 'csrId', foreignField: '_id', as: 'csr' } },
    { $set: { clinicName: { $ifNull: [{ $arrayElemAt: ['$clinic.name', 0] }, 'Unknown clinic'] }, csrName: { $ifNull: [{ $arrayElemAt: ['$csr.name', 0] }, 'Unknown CSR'] } } },
    ...(filters.search ? [{ $match: { $or: [
      { clinicName: { $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      { csrName: { $regex: filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    ] } }] : []),
    { $project: {
      _id: 0, date: { $dateToString: { date: '$date', format: '%Y-%m-%d', timezone: 'UTC' } }, clinicName: 1, csrName: 1,
      outboundCalls: 1, answeredCalls: 1, conversations: 1, appointments: 1, answerRate: 1, conversionRate: 1,
      talkTimeSeconds: 1, gapTimeSeconds: 1,
    } },
    { $sort: { date: 1, clinicName: 1, csrName: 1 } },
  ]);
}

async function generateReport(type, filters) {
  const definition = getReportDefinition(type);
  const unpaginated = { ...filters, page: 1, limit: 100000, search: filters.search || '' };
  let result;
  if (type === 'agency-daily') {
    result = await metricsService.getTrends({ ...unpaginated, period: 'daily' });
    result.data = result.data.filter((row) => row.scope === 'agency');
  } else if (type === 'clinic-monthly') {
    result = await metricsService.getTrends({ ...unpaginated, period: 'monthly' });
    result.data = result.data.filter((row) => row.scope === 'clinic');
  } else if (type === 'csr-daily') {
    result = { summary: {}, data: await getCsrDaily(unpaginated) };
  } else if (type === 'booking-ratio-matrix') {
    result = await metricsService.getBookingRatios(unpaginated);
  } else if (type === 'speed-to-lead') {
    result = await metricsService.getSpeedToLead(unpaginated);
  } else if (type === 'call-efficiency') {
    result = await metricsService.getCallEfficiency(unpaginated);
  } else {
    result = await metricsService.getTalkTime(unpaginated);
  }
  return { definition, filters, summary: result.summary || {}, rows: result.data || [], generatedAt: new Date() };
}

module.exports = { generateReport };
