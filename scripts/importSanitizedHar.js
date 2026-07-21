const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDatabase = require('../config/db');
const v2Sync = require('../services/v2SyncService');
const logger = require('../utils/logger');

const endpointMap = {
  get_total_record: 'webOverview',
  get_team_details: 'webTeamDetails',
  get_lead_vs_dm: 'webLeadVsDecisionMaker',
  get_lead_vs_ans: 'webLeadVsAnswer',
  getcallstatus_team: 'webCallStatus',
  callstatus_team: 'webCallStatusDetail',
  gettags_cart_team: 'webTags',
  get_top_lead_agent: 'webTopLeadAgent',
};

function params(entry) {
  return Object.fromEntries((entry.request?.postData?.params || []).map((item) => [item.name, item.value]));
}

function parseWeek(value) {
  const dates = String(value || '').match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
  const iso = (text) => {
    const [month, day, year] = text.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };
  return dates.length === 2 ? { startDate: iso(dates[0]), endDate: iso(dates[1]) } : {};
}

function assertSanitized(har) {
  for (const entry of har.log?.entries || []) {
    for (const header of [...(entry.request?.headers || []), ...(entry.response?.headers || [])]) {
      if (/cookie|authorization|api.?key|token/i.test(header.name) && !/redacted|removed|^$/i.test(header.value || '')) {
        throw new Error(`HAR contains an unsanitized ${header.name} header. Remove secrets before importing.`);
      }
    }
  }
}

async function run() {
  const filename = process.argv[2];
  if (!filename) throw new Error('Pass a sanitized HAR path: npm run v2:import-har -- path/to/file.har');
  const absolute = path.resolve(filename);
  const har = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  assertSanitized(har);
  await connectDatabase();
  let imported = 0;
  for (const entry of har.log?.entries || []) {
    const pathname = new URL(entry.request.url).pathname.toLowerCase();
    const matched = Object.entries(endpointMap).find(([fragment]) => pathname.includes(fragment));
    if (!matched || Number(entry.response.status) >= 400) continue;
    const body = entry.response?.content?.text;
    if (!body) continue;
    let parsed;
    try { parsed = JSON.parse(body); } catch (_error) { continue; }
    const requestParams = params(entry);
    const filters = { ...parseWeek(requestParams.week), campaignId: requestParams.campaign || null };
    await v2Sync.storeSnapshot({
      endpointKey: matched[1], filters, rawPayload: parsed,
      recordCount: Array.isArray(parsed) ? parsed.length : 1,
      expectedRecordCount: Array.isArray(parsed) ? parsed.length : 1,
      complete: true,
      metadata: { importedFromSanitizedHar: path.basename(absolute), capturedAt: entry.startedDateTime || null },
      sourceAsOf: entry.startedDateTime ? new Date(entry.startedDateTime) : new Date(),
    });
    imported += 1;
  }
  logger.info('sanitized_har_imported', { filename: path.basename(absolute), snapshots: imported });
}

run().catch((error) => {
  logger.error('sanitized_har_import_failed', { error });
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
