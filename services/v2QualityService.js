const DataQualityIssueV2 = require('../models/DataQualityIssueV2');
const payload = require('./v2PayloadService');

async function report(category, message, options = {}) {
  const issueKey = options.issueKey || payload.hash({
    category,
    entityType: options.entityType || '',
    externalId: options.externalId || '',
    clinicId: String(options.clinicId || ''),
    discriminator: options.discriminator || message,
  });
  return DataQualityIssueV2.findOneAndUpdate(
    { issueKey },
    {
      $set: {
        severity: options.severity || 'warning',
        category,
        status: 'open',
        entityType: options.entityType || '',
        externalId: options.externalId || '',
        clinicId: options.clinicId || null,
        message,
        details: options.details || {},
        lastSeenAt: new Date(),
        resolvedAt: null,
      },
      $setOnInsert: { firstSeenAt: new Date() },
    },
    { upsert: true, new: true, runValidators: true }
  );
}

async function resolve(issueKey) {
  return DataQualityIssueV2.findOneAndUpdate(
    { issueKey },
    { $set: { status: 'resolved', resolvedAt: new Date(), lastSeenAt: new Date() } },
    { new: true }
  );
}

module.exports = { report, resolve };
