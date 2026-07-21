const { parseExternalDate, parseDuration } = require('../utils/date');
const payload = require('./v2PayloadService');

const VERSION = '2.0.0';

function pick(record, ...keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null && record?.[key] !== '') return record[key];
  }
  return null;
}

function strictBoolean(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', 'yes', 'y'].includes(text)) return true;
  if (['false', 'no', 'n'].includes(text)) return false;
  return null;
}

function explicitDuration(record, keys) {
  const value = pick(record, ...keys);
  return value === null ? null : parseDuration(value);
}

function callId(record) {
  const stable = pick(record, 'CallId', 'callId', 'externalCallId', 'recordingId');
  if (stable !== null) return String(stable).trim();
  const fingerprint = {
    lead: pick(record, 'LeadId', 'leadId'),
    time: pick(record, 'call_datetime', 'call_time', 'startedAt'),
    from: pick(record, 'from_number', 'from'),
    to: pick(record, 'to_number', 'to'),
  };
  return Object.values(fingerprint).some(Boolean) ? `fp_${payload.hash(fingerprint)}` : '';
}

function normalizeCall(record, mapping, snapshotId, options = {}) {
  const timezone = mapping.timezone;
  const directionValue = String(pick(record, 'call_type', 'direction', 'call_direction') || '').trim().toLowerCase();
  const direction = directionValue === 'inbound' || directionValue === 'outbound' ? directionValue : null;
  const startedAt = parseExternalDate(pick(record, 'call_datetime', 'call_time', 'startedAt'), timezone);
  const status = String(pick(record, 'call_status', 'status') || '').trim().toLowerCase();
  const durationSeconds = explicitDuration(record, ['duration', 'durationSeconds']) ?? 0;
  const explicitAnswered = strictBoolean(pick(record, 'answered', 'is_answered'));
  const explicitConversation = strictBoolean(pick(record, 'conversation', 'is_conversation', 'decision_maker'));
  let answered = explicitAnswered;
  if (answered === null && options.answerThresholdVerified && direction === 'outbound') {
    answered = !['failed', 'busy', 'ringing', 'no-answer', 'missed'].includes(status) &&
      durationSeconds > options.answerThresholdSeconds;
  }
  return {
    externalCallId: callId(record),
    externalLeadId: String(pick(record, 'LeadId', 'leadId', 'externalLeadId') || '').trim(),
    clinicId: mapping.clinicId,
    csrExternalId: String(pick(record, 'memberId', 'agentId', 'userId', 'csrId') || '').trim(),
    campaignId: String(pick(record, 'campaignId', 'campaign_id') || '').trim(),
    groupId: String(pick(record, 'groupId', 'group_id') || '').trim(),
    direction,
    status,
    answered,
    conversation: explicitConversation,
    startedAt,
    durationSeconds,
    talkTimeSeconds: explicitDuration(record, ['talk_time', 'talkTime', 'talk_time_seconds', 'talkTimeSeconds']),
    disposition: String(pick(record, 'disposition', 'disposition_status') || '').trim(),
    sourceSnapshotId: snapshotId,
    sourceHash: payload.hash(record),
    normalizationVersion: VERSION,
  };
}

function validateCall(call) {
  const errors = [];
  if (!call.externalCallId) errors.push('missing_external_call_id');
  if (!call.clinicId) errors.push('unmapped_clinic');
  if (!call.direction) errors.push('unknown_direction');
  if (!call.startedAt) errors.push('invalid_started_at');
  if (!call.status) errors.push('missing_status');
  return errors;
}

function normalizeLead(record, mapping, snapshotId) {
  return {
    externalLeadId: String(pick(record, 'LeadId', 'leadId', 'externalLeadId') || '').trim(),
    clinicId: mapping.clinicId,
    csrExternalId: String(pick(record, 'memberId', 'agentId', 'userId', 'csrId') || '').trim(),
    campaignId: String(pick(record, 'campaignId', 'campaign_id') || '').trim(),
    groupId: String(pick(record, 'groupId', 'group_id') || '').trim(),
    createdAtExternal: parseExternalDate(pick(record, 'lead_created_at', 'leadCreatedAt', 'created_date', 'createdAt'), mapping.timezone),
    firstDialAt: parseExternalDate(pick(record, 'first_dial_at', 'firstDialAt'), mapping.timezone),
    sourceSnapshotId: snapshotId,
    sourceHash: payload.hash(record),
    normalizationVersion: VERSION,
  };
}

function normalizeAppointment(record, mapping, snapshotId) {
  return {
    externalAppointmentId: String(pick(record, 'appointmentId', 'AppointmentId', 'externalAppointmentId', 'id') || '').trim(),
    externalLeadId: String(pick(record, 'LeadId', 'leadId', 'externalLeadId') || '').trim(),
    clinicId: mapping.clinicId,
    csrExternalId: String(pick(record, 'memberId', 'agentId', 'bookedBy', 'userId') || '').trim(),
    campaignId: String(pick(record, 'campaignId', 'campaign_id') || '').trim(),
    status: String(pick(record, 'appointmentStatus', 'status') || '').trim().toLowerCase(),
    appointmentDate: parseExternalDate(pick(record, 'appointmentDate', 'appointment_date', 'start'), mapping.timezone),
    createdAtExternal: parseExternalDate(pick(record, 'createdAt', 'created_at', 'created_date'), mapping.timezone),
    sourceSnapshotId: snapshotId,
    sourceHash: payload.hash(record),
    normalizationVersion: VERSION,
  };
}

function normalizeAgent(record, snapshotId) {
  return {
    externalUserId: String(pick(record, 'memberId', 'userId', 'id', 'agentId') || '').trim(),
    name: String(pick(record, 'name', 'fullName', 'memberName', 'agentName') || '').trim(),
    email: String(pick(record, 'email', 'memberEmail') || '').trim().toLowerCase(),
    active: strictBoolean(pick(record, 'active', 'isActive')) !== false,
    sourceSnapshotId: snapshotId,
    sourceHash: payload.hash(record),
    normalizationVersion: VERSION,
  };
}

module.exports = {
  VERSION, pick, strictBoolean, explicitDuration, normalizeCall, validateCall,
  normalizeLead, normalizeAppointment, normalizeAgent,
};
