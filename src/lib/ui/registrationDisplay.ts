function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Reduces a canonical registration to fields that CRM tables are allowed to
 * display. Raw formData and other free-form registration answers are
 * deliberately excluded.
 */
export function registrationDisplayRecord(
  id: string,
  record: Record<string, unknown>,
  date: Date | null = null,
) {
  const participant = objectValue(record.participantSummary);
  const payer = objectValue(record.payerSummary);
  const combinedLegacyName = [
    cleanText(record.firstName),
    cleanText(record.lastName),
  ].filter(Boolean).join(' ') || null;
  const participantName =
    cleanText(participant.fullName)
    || cleanText(participant.displayName)
    || [
      cleanText(participant.firstName),
      cleanText(participant.lastName),
    ].filter(Boolean).join(' ')
    || cleanText(record.participantName)
    || cleanText(record.displayName)
    || combinedLegacyName;

  return {
    id,
    participantName,
    payerName:
      cleanText(payer.fullName)
      || cleanText(payer.displayName),
    email:
      cleanText(payer.email)
      || cleanText(record.participantEmail)
      || cleanText(record.email),
    phone:
      cleanText(payer.phone)
      || cleanText(payer.phoneNumber)
      || cleanText(record.phone),
    userId: cleanText(record.userId),
    eventId: cleanText(record.eventId),
    teamId: cleanText(record.teamId),
    teamName: cleanText(record.teamName),
    status: cleanText(record.status),
    date,
  };
}
