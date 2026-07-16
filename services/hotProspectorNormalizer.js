const crypto = require('crypto');
const { parseExternalDate, parseDuration, startOfUtcDay } = require('../utils/date');

function pick(record, ...keys) {
  if (!record || typeof record !== 'object') return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
    const actual = Object.keys(record).find((candidate) => candidate.toLowerCase() === String(key).toLowerCase());
    if (actual && record[actual] !== undefined && record[actual] !== null && record[actual] !== '') return record[actual];
  }
  return undefined;
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value).trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : fallback;
}

function percentValue(value) {
  return Math.min(100, Math.max(0, numberValue(value)));
}

function stableId(prefix, record, identityFields, fingerprintFields) {
  const supplied = pick(record, ...identityFields);
  if (supplied !== undefined) return stringValue(supplied);
  const fingerprint = JSON.stringify(fingerprintFields.map((field) => pick(record, field)));
  return `${prefix}_${crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 32)}`;
}

function normalizeCampaign(record) {
  return {
    id: stringValue(pick(record, 'campaign_id', 'campaignId', 'CampaignId', 'id')),
    name: stringValue(pick(record, 'CampaignTitle', 'campaignTitle', 'name', 'title'), 'Untitled campaign'),
    rawData: record,
  };
}

function normalizeGroup(record) {
  return {
    id: stringValue(pick(record, 'GroupId', 'groupId', 'id')),
    name: stringValue(pick(record, 'GroupTitle', 'groupTitle', 'name', 'title'), 'Untitled group'),
    rawData: record,
  };
}

function normalizeCsr(record) {
  const firstName = stringValue(pick(record, 'first_name', 'firstName'));
  const lastName = stringValue(pick(record, 'last_name', 'lastName'));
  return {
    externalUserId: stringValue(pick(record, 'memberId', 'agentId', 'userId', 'id')),
    name: stringValue(pick(record, 'name', 'agentName')) || `${firstName} ${lastName}`.trim() || 'Unnamed agent',
    email: stringValue(pick(record, 'email', 'agentEmail')).toLowerCase(),
    active: !/inactive|disabled|deleted/i.test(stringValue(pick(record, 'member_status', 'status'))),
  };
}

function normalizeLead(record, clinic, assignedCsrId = null) {
  const callDate = parseExternalDate(pick(record, 'call_datetime', 'call_time'), clinic.timezone);
  const suppliedCreatedAt = parseExternalDate(
    pick(record, 'createdAt', 'created_at', 'lead_created_at', 'leadCreatedAt', 'dated'),
    clinic.timezone
  );
  const speedToLeadSeconds = Math.max(0, numberValue(pick(record, 'speedToLeadSeconds', 'speed_to_lead')));
  const createdAtExternal = suppliedCreatedAt ||
    (callDate && speedToLeadSeconds ? new Date(callDate.getTime() - speedToLeadSeconds * 1000) : null);
  const direction = stringValue(pick(record, 'call_type', 'direction', 'type')).toLowerCase();
  return {
    externalLeadId: stringValue(pick(record, 'LeadId', 'leadId', 'externalLeadId', 'id')),
    clinicId: clinic._id,
    assignedCsrId,
    campaignId: stringValue(pick(record, 'campaignId', 'campaign_id')) || clinic.hotProspectorCampaignId || '',
    groupId: stringValue(pick(record, 'GroupId', 'groupId', 'group_id')) || clinic.hotProspectorGroupId || '',
    source: stringValue(pick(record, 'source', 'lead_source', 'Source')),
    status: stringValue(pick(record, 'status', 'statusName', 'lead_status')),
    createdAtExternal,
    firstDialAt: parseExternalDate(pick(record, 'firstDialAt', 'first_dial_at', 'first_call_at'), clinic.timezone) ||
      (direction.includes('out') ? callDate : null),
    rawData: record,
    syncedAt: new Date(),
  };
}

function normalizeCall(record, clinic, leadId = null, csrId = null) {
  const startedAt = parseExternalDate(
    pick(record, 'startedAt', 'call_datetime', 'call_time', 'dated', 'created_at'),
    clinic.timezone
  );
  const durationSeconds = parseDuration(pick(record, 'durationSeconds', 'duration', 'call_duration'));
  const talkTimeSeconds = parseDuration(pick(record, 'talkTimeSeconds', 'talk_time', 'talkTime')) || durationSeconds;
  const status = stringValue(pick(record, 'call_status', 'status', 'statusName'));
  const directionRaw = stringValue(pick(record, 'call_type', 'direction', 'type')).toLowerCase();
  const direction = directionRaw.includes('in') ? 'inbound' : directionRaw.includes('out') ? 'outbound' : 'unknown';
  const externalCallId = stableId(
    'call',
    record,
    ['externalCallId', 'recordingId', 'callId', 'id'],
    ['leadId', 'call_time', 'from_number', 'to_number', 'duration']
  );
  const answered = /answered|completed|connected/i.test(status) || durationSeconds > 0;
  return {
    externalCallId,
    clinicId: clinic._id,
    leadId,
    csrId,
    campaignId: stringValue(pick(record, 'campaignId', 'campaign_id')) || clinic.hotProspectorCampaignId || '',
    direction,
    status,
    answered,
    conversation: Boolean(pick(record, 'conversation', 'is_conversation', 'transcript_text', 'message_data')),
    startedAt,
    answeredAt: parseExternalDate(pick(record, 'answeredAt', 'answered_at'), clinic.timezone),
    endedAt: parseExternalDate(pick(record, 'endedAt', 'ended_at'), clinic.timezone) ||
      (startedAt && durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null),
    durationSeconds,
    talkTimeSeconds,
    disposition: stringValue(pick(record, 'disposition', 'dispositionName', 'statusId')),
    recordingUrl: stringValue(pick(record, 'recordingUrl', 'recording', 'recording_url')),
    speedToLeadSeconds: Math.max(0, numberValue(pick(record, 'speedToLeadSeconds', 'speed_to_lead'))),
    rawData: record,
    syncedAt: new Date(),
  };
}

function normalizeAppointment(record, clinic, leadId = null, csrId = null) {
  return {
    externalAppointmentId: stableId(
      'appointment',
      record,
      ['externalAppointmentId', 'appointmentId', 'appointment_id', 'id'],
      ['leadId', 'appointmentDate', 'appointment_date', 'scheduled_at']
    ),
    clinicId: clinic._id,
    leadId,
    bookedByCsrId: csrId,
    campaignId: stringValue(pick(record, 'campaignId', 'campaign_id')) || clinic.hotProspectorCampaignId || '',
    appointmentDate: parseExternalDate(pick(record, 'appointmentDate', 'appointment_date', 'scheduled_at'), clinic.timezone),
    createdAtExternal: parseExternalDate(pick(record, 'createdAt', 'created_at', 'dated'), clinic.timezone),
    status: stringValue(pick(record, 'status', 'appointment_status')),
    cancelledAt: parseExternalDate(pick(record, 'cancelledAt', 'cancelled_at'), clinic.timezone),
    rawData: record,
    syncedAt: new Date(),
  };
}

function normalizeDailyMetric(record, clinic, csrId, date) {
  const inboundCalls = Math.max(0, numberValue(pick(record, 'inboundCalls', 'inboundCall')));
  const outboundCalls = Math.max(0, numberValue(pick(record, 'outboundCalls', 'outboundCall')));
  const answeredCalls = Math.max(0, numberValue(pick(record, 'answeredCalls', 'answered_calls')));
  const conversations = Math.max(0, numberValue(pick(record, 'conversations', 'convos')));
  const appointments = Math.max(0, numberValue(pick(record, 'appointments', 'Appts')));
  const firstCall = pick(record, 'firstCall');
  const lastCall = pick(record, 'lastCall');
  return {
    date: startOfUtcDay(date),
    clinicId: clinic._id,
    csrId,
    inboundCalls,
    outboundCalls,
    answeredCalls,
    conversations,
    appointments,
    talkTimeSeconds: pick(record, 'talkTimeSeconds') !== undefined
      ? parseDuration(pick(record, 'talkTimeSeconds'))
      : Math.max(0, numberValue(pick(record, 'talkMin'))) * 60,
    gapTimeSeconds: parseDuration(pick(record, 'gapTimeSeconds', 'gapTime')),
    firstCallAt: firstCall ? parseExternalDate(`${String(date.toISOString()).slice(0, 10)} ${firstCall}`, clinic.timezone) : null,
    lastCallAt: lastCall ? parseExternalDate(`${String(date.toISOString()).slice(0, 10)} ${lastCall}`, clinic.timezone) : null,
    workingTimeSeconds: parseDuration(pick(record, 'workingTimeSeconds', 'hours')),
    answerRate: percentValue(pick(record, 'answerRate', 'answer_rate')) ||
      (inboundCalls + outboundCalls ? (answeredCalls / (inboundCalls + outboundCalls)) * 100 : 0),
    conversionRate: percentValue(pick(record, 'conversionRate', 'cr')) ||
      (conversations ? (appointments / conversations) * 100 : 0),
    rawData: record,
    syncedAt: new Date(),
  };
}

module.exports = {
  pick,
  normalizeCampaign,
  normalizeGroup,
  normalizeCsr,
  normalizeLead,
  normalizeCall,
  normalizeAppointment,
  normalizeDailyMetric,
};
