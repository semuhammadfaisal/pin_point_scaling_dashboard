const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|api[_-]?(?:key|uid)/i;

function safeMetadata(value) {
  if (Array.isArray(value)) return value.map(safeMetadata);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 1000) : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : safeMetadata(entry),
  ]));
}

async function recordAudit(req, action, details = {}) {
  try {
    return await AuditLog.create({
      action,
      actorId: details.actorId || req.session?.admin?.id || null,
      actorEmail: details.actorEmail || req.session?.admin?.email || '',
      status: details.status || 'success',
      targetType: details.targetType || '',
      targetId: String(details.targetId || ''),
      ipAddress: req.ip || req.socket?.remoteAddress || '',
      userAgent: String(req.get?.('user-agent') || '').slice(0, 500),
      metadata: safeMetadata(details.metadata || {}),
    });
  } catch (error) {
    logger.error('audit_log_write_failed', { action, error });
    return null;
  }
}

module.exports = { recordAudit, safeMetadata };
