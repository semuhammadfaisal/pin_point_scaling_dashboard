const { validationResult } = require('express-validator');
const Clinic = require('../models/Clinic');
const CSR = require('../models/CSR');
const SyncLog = require('../models/SyncLog');
const ClinicSourceMappingV2 = require('../models/ClinicSourceMappingV2');
const api = require('../services/hotProspectorApiService');
const normalizer = require('../services/hotProspectorNormalizer');
const syncService = require('../services/hotProspectorSyncService');
const { setFlash } = require('../middleware/flash');
const slugify = require('../utils/slugify');
const { recordAudit } = require('../services/auditService');

const page = {
  layout: 'layouts/main',
  title: 'Settings',
  pageTitle: 'Settings',
  pageDescription: 'Manage clinic mappings, integrations, and synchronization activity.',
};

function validationMessage(req) {
  const errors = validationResult(req);
  return errors.isEmpty() ? null : errors.array().map((error) => error.msg).join(' ');
}

function validTimezone(timezone) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch (_error) {
    return false;
  }
}

async function remoteCatalog() {
  const [campaignResult, groupResult] = await Promise.allSettled([api.fetchCampaigns(), api.fetchGroups()]);
  return {
    campaigns: campaignResult.status === 'fulfilled' ? campaignResult.value.map(normalizer.normalizeCampaign) : [],
    groups: groupResult.status === 'fulfilled' ? groupResult.value.map(normalizer.normalizeGroup) : [],
    apiError:
      campaignResult.status === 'rejected'
        ? campaignResult.reason.message
        : groupResult.status === 'rejected'
          ? groupResult.reason.message
          : null,
  };
}

async function showSettings(_req, res) {
  const [clinicCount, csrCount, latestSync] = await Promise.all([
    Clinic.countDocuments(),
    CSR.countDocuments(),
    SyncLog.findOne().sort({ startedAt: -1 }).lean(),
  ]);
  res.render('settings/index', { ...page, clinicCount, csrCount, latestSync });
}

async function showIntegrations(_req, res) {
  const [{ campaigns, groups, apiError }, csrs] = await Promise.all([
    remoteCatalog(),
    CSR.find().populate('clinicIds', 'name').sort({ active: -1, name: 1 }).lean(),
  ]);
  res.render('settings/integrations', {
    ...page,
    title: 'Hot Prospector Integration',
    pageTitle: 'Hot Prospector integration',
    campaigns,
    groups,
    csrs,
    apiError,
  });
}

async function testIntegration(req, res) {
  try {
    const result = await api.testConnection();
    await recordAudit(req, 'settings_change', { metadata: { operation: 'integration_connection_test' } });
    setFlash(req, 'success', result.message);
  } catch (error) {
    await recordAudit(req, 'settings_change', { status: 'failure', metadata: { operation: 'integration_connection_test' } });
    setFlash(req, 'error', `Connection failed: ${error.message}`);
  }
  res.redirect('/settings/integrations');
}

async function showClinics(_req, res) {
  const [{ campaigns, groups, apiError }, clinics, v2Mappings] = await Promise.all([
    remoteCatalog(),
    Clinic.find().sort({ active: -1, name: 1 }).lean(),
    ClinicSourceMappingV2.find().lean(),
  ]);
  const mappingByClinic = new Map(v2Mappings.map((mapping) => [String(mapping.clinicId), mapping]));
  res.render('settings/clinics', {
    ...page,
    title: 'Clinic Mapping',
    pageTitle: 'Clinic mapping',
    campaigns,
    groups,
    clinics: clinics.map((clinic) => ({ ...clinic, v2Mapping: mappingByClinic.get(String(clinic._id)) || null })),
    apiError,
  });
}

async function createClinic(req, res) {
  const message = validationMessage(req);
  if (message) {
    setFlash(req, 'error', message);
    return res.redirect('/settings/clinics');
  }
  const timezone = String(req.body.timezone || 'UTC').trim();
  if (!validTimezone(timezone)) {
    setFlash(req, 'error', 'Enter a valid IANA timezone such as America/Chicago.');
    return res.redirect('/settings/clinics');
  }
  const slug = slugify(req.body.slug || req.body.name);
  try {
    const clinic = await Clinic.create({
      name: req.body.name,
      slug,
      hotProspectorCampaignId: req.body.hotProspectorCampaignId || null,
      hotProspectorGroupId: req.body.hotProspectorGroupId || null,
      timezone,
      active: req.body.active === 'true',
    });
    await ClinicSourceMappingV2.findOneAndUpdate(
      { clinicId: clinic._id },
      {
        $set: {
          sourceLocationId: String(req.body.sourceLocationId || '').trim() || undefined,
          sourceCampaignId: clinic.hotProspectorCampaignId || '',
          sourceGroupId: clinic.hotProspectorGroupId || '',
          aliases: String(req.body.locationAliases || clinic.name).split(',').map((value) => value.trim()).filter(Boolean),
          timezone,
          timezoneVerified: req.body.timezoneVerified === 'true',
          mappingVerified: req.body.mappingVerified === 'true',
          verifiedAt: req.body.timezoneVerified === 'true' && req.body.mappingVerified === 'true' ? new Date() : null,
          verifiedBy: req.session.admin.id,
        },
        ...(String(req.body.sourceLocationId || '').trim() ? {} : { $unset: { sourceLocationId: 1 } }),
      },
      { upsert: true, runValidators: true }
    );
    await recordAudit(req, 'clinic_mapping_change', {
      targetType: 'Clinic', targetId: clinic._id,
      metadata: { operation: 'create', campaignId: clinic.hotProspectorCampaignId, groupId: clinic.hotProspectorGroupId, timezone: clinic.timezone },
    });
    setFlash(req, 'success', 'Clinic created successfully.');
  } catch (error) {
    setFlash(req, 'error', error.code === 11000 ? 'That clinic slug is already in use.' : error.message);
  }
  return res.redirect('/settings/clinics');
}

async function updateClinic(req, res) {
  const message = validationMessage(req);
  if (message) {
    setFlash(req, 'error', message);
    return res.redirect('/settings/clinics');
  }
  const timezone = String(req.body.timezone || 'UTC').trim();
  if (!validTimezone(timezone)) {
    setFlash(req, 'error', 'Enter a valid IANA timezone such as America/Chicago.');
    return res.redirect('/settings/clinics');
  }
  try {
    const previous = await Clinic.findById(req.params.id).lean();
    const clinic = await Clinic.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        slug: slugify(req.body.slug || req.body.name),
        hotProspectorCampaignId: req.body.hotProspectorCampaignId || null,
        hotProspectorGroupId: req.body.hotProspectorGroupId || null,
        timezone,
        active: req.body.active === 'true',
      },
      { new: true, runValidators: true }
    );
    if (!clinic) setFlash(req, 'error', 'Clinic not found.');
    else {
      await ClinicSourceMappingV2.findOneAndUpdate(
        { clinicId: clinic._id },
        {
          $set: {
            sourceLocationId: String(req.body.sourceLocationId || '').trim() || undefined,
            sourceCampaignId: clinic.hotProspectorCampaignId || '',
            sourceGroupId: clinic.hotProspectorGroupId || '',
            aliases: String(req.body.locationAliases || clinic.name).split(',').map((value) => value.trim()).filter(Boolean),
            timezone,
            timezoneVerified: req.body.timezoneVerified === 'true',
            mappingVerified: req.body.mappingVerified === 'true',
            verifiedAt: req.body.timezoneVerified === 'true' && req.body.mappingVerified === 'true' ? new Date() : null,
            verifiedBy: req.session.admin.id,
          },
          ...(String(req.body.sourceLocationId || '').trim() ? {} : { $unset: { sourceLocationId: 1 } }),
        },
        { upsert: true, runValidators: true }
      );
      await recordAudit(req, 'clinic_mapping_change', {
        targetType: 'Clinic', targetId: clinic._id,
        metadata: {
          operation: 'update',
          before: previous ? { campaignId: previous.hotProspectorCampaignId, groupId: previous.hotProspectorGroupId, timezone: previous.timezone, active: previous.active } : null,
          after: { campaignId: clinic.hotProspectorCampaignId, groupId: clinic.hotProspectorGroupId, timezone: clinic.timezone, active: clinic.active },
        },
      });
      setFlash(req, 'success', `${clinic.name} updated successfully.`);
    }
  } catch (error) {
    setFlash(req, 'error', error.code === 11000 ? 'That clinic slug is already in use.' : error.message);
  }
  return res.redirect('/settings/clinics');
}

async function triggerSync(req, res) {
  const syncType = req.body.syncType || 'recent';
  const handlers = {
    recent: () => syncService.syncRecent(),
    metrics: () => syncService.syncAgentMetrics(),
    sevenDays: () => syncService.syncPreviousSevenDays(),
    recalculate: () => syncService.recalculateDailyMetrics(7),
  };
  if (!handlers[syncType]) {
    setFlash(req, 'error', 'Unknown synchronization type.');
    return res.redirect('/settings/sync-logs');
  }
  const log = await handlers[syncType]();
  await recordAudit(req, 'manual_sync', {
    targetType: 'SyncLog', targetId: log._id,
    status: log.status === 'failed' ? 'failure' : 'success',
    metadata: { syncType, syncStatus: log.status, recordsFetched: log.recordsFetched, recordsFailed: log.recordsFailed },
  });
  const type = log.status === 'success' ? 'success' : 'error';
  setFlash(req, type, `Synchronization finished with status: ${log.status}.`);
  return res.redirect('/settings/sync-logs');
}

async function showSyncLogs(req, res) {
  const pageNumber = Math.max(1, Number(req.query.page || 1));
  const pageSize = 30;
  const [logs, total] = await Promise.all([
    SyncLog.find().sort({ startedAt: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize).lean(),
    SyncLog.countDocuments(),
  ]);
  res.render('settings/sync-logs', {
    ...page,
    title: 'Synchronization Logs',
    pageTitle: 'Synchronization logs',
    logs,
    pagination: { page: pageNumber, pages: Math.max(1, Math.ceil(total / pageSize)) },
  });
}

module.exports = {
  showSettings,
  showIntegrations,
  testIntegration,
  showClinics,
  createClinic,
  updateClinic,
  triggerSync,
  showSyncLogs,
};
