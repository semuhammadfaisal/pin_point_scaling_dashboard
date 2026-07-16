const { Readable } = require('stream');
const ExcelJS = require('exceljs');

function safeSpreadsheetText(value) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function sanitizeFilename(value) {
  return String(value || 'report').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'report';
}

function durationText(value) {
  let seconds = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function displayValue(value, type) {
  if (type === 'percent') return `${Number(value || 0).toFixed(2)}%`;
  if (type === 'duration') return durationText(value);
  if (type === 'number') return Number(value || 0);
  if (type === 'decimal') return Number(value || 0).toFixed(2);
  return safeSpreadsheetText(value);
}

function csvCell(value) {
  return `"${safeSpreadsheetText(value).replaceAll('"', '""')}"`;
}

function metadataRows(report) {
  const { filters } = report;
  return [
    ['Report', report.definition.label],
    ['Generated at', report.generatedAt.toISOString()],
    ['Start date', filters.startDate], ['End date', filters.endDate],
    ['Clinic ID', filters.clinicId || 'All clinics'], ['CSR ID', filters.csrId || 'All CSRs'],
    ['Campaign ID', filters.campaignId || 'All campaigns'], ['Group ID', filters.groupId || 'All groups'],
  ];
}

function streamCsv(res, report) {
  function* rows() {
    yield '\uFEFF';
    for (const row of metadataRows(report)) yield `${row.map(csvCell).join(',')}\r\n`;
    yield '\r\n';
    yield `${report.definition.columns.map((column) => csvCell(column.label)).join(',')}\r\n`;
    for (const row of report.rows) {
      yield `${report.definition.columns.map((column) => csvCell(displayValue(row[column.key], column.dataType))).join(',')}\r\n`;
    }
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${sanitizeFilename(report.definition.type)}-${report.filters.startDate}-to-${report.filters.endDate}.csv"`, 'X-Content-Type-Options': 'nosniff' });
  Readable.from(rows()).pipe(res);
}

async function streamXlsx(res, report) {
  const filename = `${sanitizeFilename(report.definition.type)}-${report.filters.startDate}-to-${report.filters.endDate}.xlsx`;
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename}"`, 'X-Content-Type-Options': 'nosniff' });
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: true });
  workbook.creator = 'ClinicPulse';
  workbook.created = report.generatedAt;
  const sheet = workbook.addWorksheet('Report', { views: [{ state: 'frozen', ySplit: 11 }] });
  const columnCount = report.definition.columns.length;
  report.definition.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.min(42, Math.max(14, column.label.length + 4));
  });
  sheet.mergeCells(1, 1, 1, columnCount);
  const title = sheet.getCell(1, 1);
  title.value = report.definition.label;
  title.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF35369A' } };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 28;
  metadataRows(report).forEach(([label, value], index) => {
    const row = sheet.getRow(index + 2);
    row.values = [safeSpreadsheetText(label), safeSpreadsheetText(value)];
    row.getCell(1).font = { bold: true, color: { argb: 'FF5B6474' } };
    row.commit();
  });
  const headerRowNumber = 11;
  const header = sheet.getRow(headerRowNumber);
  header.values = report.definition.columns.map((column) => column.label);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B5BD6' } };
  header.alignment = { vertical: 'middle' };
  header.height = 24;
  header.commit();
  for (const data of report.rows) {
    const row = sheet.addRow(report.definition.columns.map((column) => {
      const value = data[column.key];
      if (column.dataType === 'percent') return Number(value || 0) / 100;
      if (column.dataType === 'duration') return Number(value || 0) / 86400;
      if (['number', 'decimal'].includes(column.dataType)) return Number(value || 0);
      return safeSpreadsheetText(value);
    }));
    report.definition.columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      if (column.dataType === 'percent') cell.numFmt = '0.00%';
      if (column.dataType === 'duration') cell.numFmt = '[h]:mm:ss';
      if (column.dataType === 'decimal') cell.numFmt = '0.00';
    });
    row.commit();
  }
  sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: columnCount } };
  sheet.commit();
  await workbook.commit();
}

module.exports = { streamCsv, streamXlsx, safeSpreadsheetText, sanitizeFilename, displayValue };
