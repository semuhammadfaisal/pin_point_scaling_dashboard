const { definitions } = require('../config/reportDefinitions');
const { getFilterOptions } = require('../services/dashboardViewService');
const { generateReport } = require('../services/reportService');
const { streamCsv, streamXlsx } = require('../services/reportExportService');
const { recordAudit } = require('../services/auditService');

async function showReports(_req, res) {
  res.render('reports/index', {
    layout: 'layouts/main',
    title: 'Reports',
    pageTitle: 'Reports and exports',
    pageDescription: 'Preview and export operational reports with consistent production metrics.',
    pageScript: '/js/reports.js',
    filterOptions: await getFilterOptions(),
    reportTypes: Object.entries(definitions).map(([value, report]) => ({ value, label: report.label })),
  });
}

async function preview(req, res) {
  const report = await generateReport(req.reportType, req.metricsFilters);
  if (res.locals.requestTimedOut || res.writableEnded) return;
  return res.json({
    success: true,
    filters: { ...req.metricsFilters, reportType: req.reportType },
    summary: { ...report.summary, totalRows: report.rows.length, previewRows: Math.min(report.rows.length, 100) },
    columns: report.definition.columns,
    data: report.rows.slice(0, 100),
    generatedAt: report.generatedAt.toISOString(),
  });
}

async function exportCsv(req, res) {
  const report = await generateReport(req.reportType, req.metricsFilters);
  if (res.locals.requestTimedOut || res.writableEnded) return;
  await recordAudit(req, 'export', { metadata: { format: 'csv', reportType: req.reportType, filters: req.metricsFilters, rowCount: report.rows.length } });
  streamCsv(res, report);
}

async function exportXlsx(req, res) {
  const report = await generateReport(req.reportType, req.metricsFilters);
  if (res.locals.requestTimedOut || res.writableEnded) return;
  await recordAudit(req, 'export', { metadata: { format: 'xlsx', reportType: req.reportType, filters: req.metricsFilters, rowCount: report.rows.length } });
  await streamXlsx(res, report);
}

module.exports = { showReports, preview, exportCsv, exportXlsx };
