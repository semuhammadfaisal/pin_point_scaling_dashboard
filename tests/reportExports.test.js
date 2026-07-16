const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');
const { getReportDefinition } = require('../config/reportDefinitions');
const { streamCsv, streamXlsx, safeSpreadsheetText, sanitizeFilename } = require('../services/reportExportService');

function reportFixture() {
  return {
    definition: getReportDefinition('call-efficiency'),
    filters: { startDate: '2026-07-01', endDate: '2026-07-17', clinicId: '', csrId: '', campaignId: '', groupId: '' },
    summary: {},
    rows: [{ clinicName: '=HYPERLINK("bad")', outboundDials: 20, uniqueLeadsDialed: 10, dialsPerLead: 2, answerRate: 50, conversationRate: 25 }],
    generatedAt: new Date('2026-07-17T12:00:00.000Z'),
  };
}

function responseStream() {
  const stream = new PassThrough();
  stream.headers = {};
  stream.set = jest.fn((headers) => { stream.headers = { ...stream.headers, ...headers }; return stream; });
  return stream;
}

test('spreadsheet formula injection is escaped and filenames are sanitized', () => {
  expect(safeSpreadsheetText('=2+2')).toBe("'=2+2");
  expect(safeSpreadsheetText('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
  expect(sanitizeFilename('../../Agency Report 2026')).toBe('agency-report-2026');
});

test('CSV export includes filters, headings, values, and escaped formulas', async () => {
  const response = responseStream();
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  const ended = new Promise((resolve, reject) => response.on('end', resolve).on('error', reject));
  streamCsv(response, reportFixture());
  await ended;
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(response.headers['Content-Type']).toContain('text/csv');
  expect(csv).toContain('"Start date","2026-07-01"');
  expect(csv).toContain('"Answer rate"');
  expect(csv).toContain("'=HYPERLINK");
});

test('Excel export produces a readable styled workbook with percentage formatting', async () => {
  const response = responseStream();
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  const ended = new Promise((resolve, reject) => response.on('end', resolve).on('error', reject));
  await streamXlsx(response, reportFixture());
  await ended;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.concat(chunks));
  const sheet = workbook.getWorksheet('Report');
  expect(sheet.getCell('A1').value).toBe('Call-efficiency report');
  expect(sheet.getCell('E12').numFmt).toBe('0.00%');
  expect(sheet.getCell('E12').value).toBe(0.5);
  expect(sheet.getCell('A12').value).toBe("'=HYPERLINK(\"bad\")");
});
