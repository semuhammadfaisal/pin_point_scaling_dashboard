function safeDivide(numerator, denominator, multiplier = 1) {
  return denominator > 0 ? (numerator / denominator) * multiplier : 0;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function percentage(numerator, denominator) {
  return round(safeDivide(numerator, denominator, 100));
}

function average(total, count) {
  return round(safeDivide(total, count));
}

function median(values) {
  const numbers = values.filter(Number.isFinite).sort((first, second) => first - second);
  if (!numbers.length) return 0;
  const middle = Math.floor(numbers.length / 2);
  return round(numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2);
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function uniqueBy(records, keySelector) {
  const seen = new Set();
  return records.filter((record, index) => {
    const key = keySelector(record, index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function calculateFromRecords({
  leads = [],
  calls = [],
  appointments = [],
  workingTimeSeconds = 0,
  gapTimeSeconds = 0,
  validStatuses = ['booked', 'confirmed', 'scheduled'],
  excludedStatuses = ['cancelled', 'deleted', 'no-show'],
  clinicId,
  csrId,
} = {}) {
  const sameId = (first, second) => String(first || '') === String(second || '');
  const scopedLeads = leads.filter((lead) => (!clinicId || sameId(lead.clinicId, clinicId)) && (!csrId || sameId(lead.assignedCsrId, csrId)));
  const scopedCalls = calls.filter((call) => (!clinicId || sameId(call.clinicId, clinicId)) && (!csrId || sameId(call.csrId, csrId)));
  const scopedAppointments = appointments.filter((appointment) =>
    (!clinicId || sameId(appointment.clinicId, clinicId)) && (!csrId || sameId(appointment.bookedByCsrId, csrId))
  );
  const uniqueLeads = uniqueBy(scopedLeads, (lead, index) => String(lead.externalLeadId || lead._id || `lead-${index}`));
  const uniqueCalls = uniqueBy(scopedCalls, (call, index) => String(call.externalCallId || call._id || `call-${index}`));
  const uniqueAppointments = uniqueBy(
    scopedAppointments,
    (appointment, index) => String(appointment.externalAppointmentId || appointment._id || `appointment-${index}`)
  );
  const validSet = new Set(validStatuses.map(normalizeStatus));
  const excludedSet = new Set(excludedStatuses.map(normalizeStatus));
  const validBookings = uniqueAppointments.filter((appointment) => {
    const status = normalizeStatus(appointment.status);
    return validSet.has(status) && !excludedSet.has(status);
  });
  const outboundCalls = uniqueCalls.filter((call) => call.direction === 'outbound');
  const answeredOutboundCalls = outboundCalls.filter((call) => call.answered);
  const answeredCalls = uniqueCalls.filter((call) => call.answered);
  const conversations = uniqueCalls.filter((call) => call.conversation);
  const dialedLeadIds = new Set(outboundCalls.map((call) => String(call.leadId || '')).filter(Boolean));
  const talkTimeSeconds = uniqueCalls.reduce((total, call) => total + Math.max(0, Number(call.talkTimeSeconds || 0)), 0);
  const speedValues = [];

  for (const lead of uniqueLeads) {
    const createdAt = new Date(lead.createdAtExternal);
    if (Number.isNaN(createdAt.getTime())) continue;
    const firstDial = outboundCalls
      .filter((call) => sameId(call.leadId, lead._id))
      .map((call) => new Date(call.startedAt))
      .filter((date) => !Number.isNaN(date.getTime()) && date >= createdAt)
      .sort((first, second) => first - second)[0];
    if (firstDial) speedValues.push((firstDial - createdAt) / 1000);
  }

  return {
    newLeads: uniqueLeads.length,
    validBookings: validBookings.length,
    outboundDials: outboundCalls.length,
    answeredOutboundCalls: answeredOutboundCalls.length,
    answeredCalls: answeredCalls.length,
    conversations: conversations.length,
    uniqueLeadsDialed: dialedLeadIds.size,
    totalGapTimeSeconds: Math.max(0, Number(gapTimeSeconds || 0)),
    talkTimeSeconds,
    workingTimeSeconds: Math.max(0, Number(workingTimeSeconds || 0)),
    leadToBookingRate: percentage(validBookings.length, uniqueLeads.length),
    conversationToBookingRate: percentage(validBookings.length, conversations.length),
    dialsPerLead: average(outboundCalls.length, dialedLeadIds.size),
    averageSpeedToLeadSeconds: average(speedValues.reduce((sum, value) => sum + value, 0), speedValues.length),
    medianSpeedToLeadSeconds: median(speedValues),
    contactedWithin1Minute: percentage(speedValues.filter((value) => value <= 60).length, speedValues.length),
    contactedWithin5Minutes: percentage(speedValues.filter((value) => value <= 300).length, speedValues.length),
    contactedWithin15Minutes: percentage(speedValues.filter((value) => value <= 900).length, speedValues.length),
    answerRate: percentage(answeredOutboundCalls.length, outboundCalls.length),
    conversationRate: percentage(conversations.length, answeredCalls.length),
    talkTimeUtilization: percentage(talkTimeSeconds, workingTimeSeconds),
    averageTalkTimePerConversation: average(talkTimeSeconds, conversations.length),
    speedSampleSize: speedValues.length,
    speedValues,
  };
}

module.exports = { safeDivide, round, percentage, average, median, calculateFromRecords };
