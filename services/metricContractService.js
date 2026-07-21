const METRIC_CONTRACTS = Object.freeze({
  newLeads: { sourceField: 'total_lead_campaign', label: 'New leads', kind: 'authoritative' },
  outboundDials: { sourceField: 'total_calls', label: 'Total calls', kind: 'authoritative' },
  answeredCalls: { sourceField: 'total_answer', label: 'Answered calls', kind: 'authoritative' },
  decisionMakers: { sourceField: 'mdm', label: 'Decision makers', kind: 'authoritative' },
  validBookings: { sourceField: 'total_appointment_overview', label: 'Appointments', kind: 'authoritative' },
  averageSpeedToLeadSeconds: { sourceField: 'Avg_speed', label: 'Average speed to lead', kind: 'authoritative' },
  averageDialsPerLead: { sourceField: 'averge_calls_per_lead', label: 'Average calls per lead', kind: 'authoritative' },
  conversations: { sourceField: null, label: 'Verified conversations', kind: 'derived', unavailableUntilVerified: true },
  talkTimeSeconds: { sourceField: null, label: 'Talk time', kind: 'derived', unavailableUntilVerified: true },
  gapTimeSeconds: { sourceField: null, label: 'Gap time', kind: 'derived', unavailableUntilVerified: true },
});

function percentage(numerator, denominator) {
  if (numerator === null || denominator === null || !denominator) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function derivedMetrics(values) {
  return {
    leadToBookingRate: percentage(values.validBookings, values.newLeads),
    appointmentToAnswerRate: percentage(values.validBookings, values.answeredCalls),
    answerRate: percentage(values.answeredCalls, values.outboundDials),
    conversationRate: percentage(values.conversations, values.answeredCalls),
    talkTimeUtilization: percentage(values.talkTimeSeconds, values.workingTimeSeconds),
    averageTalkTimePerConversation:
      values.talkTimeSeconds === null || values.conversations === null || !values.conversations
        ? null
        : Math.round(values.talkTimeSeconds / values.conversations),
  };
}

module.exports = { METRIC_CONTRACTS, percentage, derivedMetrics };
