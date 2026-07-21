const ClinicSourceMappingV2 = require('../models/ClinicSourceMappingV2');
const quality = require('./v2QualityService');

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function mappingIndex() {
  const mappings = await ClinicSourceMappingV2.find({ mappingVerified: true, timezoneVerified: true }).lean();
  const byName = new Map();
  for (const mapping of mappings) {
    for (const alias of mapping.aliases || []) byName.set(normalizeName(alias), mapping);
    if (mapping.sourceLocationId) byName.set(normalizeName(mapping.sourceLocationId), mapping);
  }
  return byName;
}

async function resolveRecord(record, index, reported = new Set()) {
  const location = String(record.location_name || record.locationName || '').trim();
  const mapping = index.get(normalizeName(location));
  if (mapping) return mapping;
  const key = normalizeName(location) || 'empty';
  if (reported.has(key)) return null;
  reported.add(key);
  await quality.report('unmapped_clinic', `Hot Prospector location "${location || 'empty'}" is not mapped to a verified clinic.`, {
    severity: 'critical',
    entityType: 'call',
    discriminator: key,
    details: { location: location || null },
  });
  return null;
}

module.exports = { normalizeName, mappingIndex, resolveRecord };
