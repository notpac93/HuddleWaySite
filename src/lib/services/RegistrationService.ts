import { backendClient } from '../api/backendClient';
import { registrationDisplayRecord } from '../ui/registrationDisplay';

type OperationalRecord = Record<string, unknown> & { id: string };

function timestampDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

async function loadAllOperationalRecords(
  tenantId: string,
  collection: 'events' | 'registration_forms' | 'registrations',
): Promise<OperationalRecord[]> {
  let cursor: string | undefined;
  const records: OperationalRecord[] = [];
  do {
    const page = await backendClient.crmOperationalPage(
      tenantId,
      collection,
      { limit: 100, cursor },
    );
    records.push(...page.records);
    cursor = page.hasMore ? page.nextCursor || undefined : undefined;
    if (page.hasMore && !cursor) {
      throw new Error('The CRM page response omitted its next cursor.');
    }
  } while (cursor);
  return records;
}

function normalizeForm(record: OperationalRecord) {
  const storedTitle =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim()
      : typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : null;
  const rawStatus =
    typeof record.status === 'string' ? record.status.toLocaleLowerCase() : null;
  return {
    ...record,
    title: storedTitle,
    name: storedTitle || 'Form name unavailable',
    rawStatus,
    status:
      rawStatus === 'archived' || rawStatus === 'closed'
        ? 'Closed'
        : rawStatus === 'active' || rawStatus === 'open'
          ? 'Open'
          : 'Status unavailable',
    dateCreated: timestampDateOrNull(record.createdAt),
    program:
      typeof record.teamId === 'string' && record.teamId.trim()
        ? record.teamId.trim()
        : 'Program-wide',
  };
}

export class RegistrationService {
  /**
   * Loads registration forms through authenticated backend pages.
   * The returned cancellation function prevents stale tenant responses from
   * updating a view after the user switches organizations or leaves the page.
   */
  static subscribeToForms(
    tenantId: string,
    callback: (forms: any[]) => void,
    onError: (error: unknown) => void = () => {},
  ) {
    if (!tenantId) {
      callback([]);
      return () => {};
    }

    let cancelled = false;
    void loadAllOperationalRecords(tenantId, 'registration_forms')
      .then((records) => {
        if (!cancelled) callback(records.map(normalizeForm).sort((left, right) => {
          if (left.dateCreated && right.dateCreated) {
            return right.dateCreated.getTime() - left.dateCreated.getTime();
          }
          if (left.dateCreated) return -1;
          if (right.dateCreated) return 1;
          return left.id.localeCompare(right.id);
        }));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Registration forms could not be loaded.');
        onError(error);
      });

    return () => {
      cancelled = true;
    };
  }

  static async fetchParticipants(tenantId: string, formId: string) {
    return (await this.fetchParticipantsPage(tenantId, formId)).records;
  }

  static async fetchParticipantsPage(tenantId: string, formId: string) {
    return (await this.fetchRegistrationDetailPage(tenantId, formId)).participants;
  }

  static async fetchEventsForForm(tenantId: string, formId: string) {
    return (await this.fetchEventsForFormPage(tenantId, formId)).records;
  }

  static async fetchEventsForFormPage(tenantId: string, formId: string) {
    if (!tenantId || !formId) {
      return { records: [], truncated: false, limit: null };
    }
    const events = await loadAllOperationalRecords(tenantId, 'events');
    return {
      records: events.filter((event) => event.registrationFormId === formId),
      truncated: false,
      limit: null,
    };
  }

  static async fetchRegistrationDetailPage(tenantId: string, formId: string) {
    if (!tenantId || !formId) {
      return {
        events: { records: [], truncated: false, limit: null },
        participants: {
          records: [],
          truncated: false,
          limit: null,
          exactCount: 0,
        },
      };
    }

    const [events, registrations] = await Promise.all([
      this.fetchEventsForFormPage(tenantId, formId),
      loadAllOperationalRecords(tenantId, 'registrations'),
    ]);
    const eventIds = new Set(
      events.records
        .map((event) => event.id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id)),
    );
    const participants = registrations
      .filter((registration) => {
        const formSubmission = registration.formSubmission
          && typeof registration.formSubmission === 'object'
          ? registration.formSubmission as Record<string, unknown>
          : null;
        return registration.formId === formId
          || formSubmission?.formId === formId
          || (typeof registration.eventId === 'string'
            && eventIds.has(registration.eventId));
      })
      .map((registration) => registrationDisplayRecord(
        registration.id,
        registration,
        timestampDateOrNull(registration.createdAt),
      ))
      .sort((left, right) => left.id.localeCompare(right.id));

    return {
      events,
      participants: {
        records: participants,
        truncated: false,
        limit: null,
        exactCount: participants.length,
      },
    };
  }
}
