const definitions = Object.freeze({
  'agency-daily': {
    label: 'Agency daily summary',
    columns: [
      ['period', 'Date', 'date'], ['newLeads', 'New leads', 'number'], ['outboundDials', 'Outbound dials', 'number'],
      ['answeredCalls', 'Answered calls', 'number'], ['conversations', 'Conversations', 'number'],
      ['validBookings', 'Bookings', 'number'], ['leadToBookingRate', 'Lead conversion', 'percent'],
      ['conversationToBookingRate', 'Conversation conversion', 'percent'],
    ],
  },
  'clinic-monthly': {
    label: 'Clinic monthly summary',
    columns: [
      ['period', 'Month', 'date'], ['clinicName', 'Clinic', 'text'], ['newLeads', 'New leads', 'number'],
      ['outboundDials', 'Outbound dials', 'number'], ['answeredCalls', 'Answered calls', 'number'],
      ['conversations', 'Conversations', 'number'], ['validBookings', 'Bookings', 'number'],
      ['leadToBookingRate', 'Lead conversion', 'percent'], ['conversationToBookingRate', 'Conversation conversion', 'percent'],
    ],
  },
  'csr-daily': {
    label: 'CSR daily performance',
    columns: [
      ['date', 'Date', 'date'], ['clinicName', 'Clinic', 'text'], ['csrName', 'CSR', 'text'],
      ['outboundCalls', 'Outbound dials', 'number'], ['answeredCalls', 'Answered calls', 'number'],
      ['conversations', 'Conversations', 'number'], ['appointments', 'Bookings', 'number'],
      ['answerRate', 'Answer rate', 'percent'], ['conversionRate', 'Booking ratio', 'percent'],
      ['talkTimeSeconds', 'Talk time', 'duration'], ['gapTimeSeconds', 'Gap time', 'duration'],
    ],
  },
  'booking-ratio-matrix': {
    label: 'Booking-ratio matrix',
    columns: [
      ['clinicName', 'Clinic', 'text'], ['csrName', 'CSR', 'text'], ['newLeads', 'Leads', 'number'],
      ['conversations', 'Conversations', 'number'], ['bookings', 'Bookings', 'number'],
      ['leadToBookingRate', 'Lead-to-booking ratio', 'percent'], ['bookingRatio', 'Conversation-to-booking ratio', 'percent'],
    ],
  },
  'speed-to-lead': {
    label: 'Speed-to-lead report',
    columns: [
      ['clinicName', 'Clinic', 'text'], ['sampleSize', 'Contacted leads', 'number'],
      ['averageSpeedToLeadSeconds', 'Average speed to lead', 'duration'], ['medianSpeedToLeadSeconds', 'Median speed to lead', 'duration'],
      ['contactedWithin1Minute', 'Within 1 minute', 'percent'], ['contactedWithin5Minutes', 'Within 5 minutes', 'percent'],
      ['contactedWithin15Minutes', 'Within 15 minutes', 'percent'],
    ],
  },
  'call-efficiency': {
    label: 'Call-efficiency report',
    columns: [
      ['clinicName', 'Clinic', 'text'], ['outboundDials', 'Outbound dials', 'number'],
      ['uniqueLeadsDialed', 'Unique leads dialed', 'number'], ['dialsPerLead', 'Dials per lead', 'decimal'],
      ['answerRate', 'Answer rate', 'percent'], ['conversationRate', 'Conversation rate', 'percent'],
    ],
  },
  'talk-time-gap-time': {
    label: 'Talk-time and gap-time report',
    columns: [
      ['clinicName', 'Clinic', 'text'], ['talkTimeSeconds', 'Talk time', 'duration'],
      ['totalGapTimeSeconds', 'Gap time', 'duration'], ['workingTimeSeconds', 'Working time', 'duration'],
      ['talkTimeUtilization', 'Talk-time utilization', 'percent'],
      ['averageTalkTimePerConversation', 'Average talk time per conversation', 'duration'],
    ],
  },
});

function getReportDefinition(type) {
  const report = definitions[type];
  if (!report) return null;
  return { ...report, type, columns: report.columns.map(([key, label, dataType]) => ({ key, label, dataType })) };
}

module.exports = { definitions, getReportDefinition };
