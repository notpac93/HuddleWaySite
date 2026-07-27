import { db } from '../firebase';
import {
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { registrationDisplayRecord } from '../ui/registrationDisplay';

const REGISTRATION_READ_LIMIT = 500;

function timestampDateOrNull(value: unknown): Date | null {
  if (!value || typeof (value as { toDate?: unknown }).toDate !== 'function') return null;
  const date = (value as { toDate: () => Date }).toDate();
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

export class RegistrationService {
  /**
   * Subscribes to events/forms for a given tenant.
   * We use onSnapshot for real-time updates.
   */
  static subscribeToForms(
    tenantId: string,
    callback: (forms: any[]) => void,
    onError: (error: unknown) => void = () => {},
    onScope: (scope: { truncated: boolean; limit: number }) => void = () => {},
  ) {
    if (!tenantId) {
      callback([]);
      return () => {}; // return empty unsubscribe function
    }

    const q = query(
      collection(db, 'registration_forms'),
      where('tenantId', '==', tenantId),
      orderBy(documentId()),
      limit(REGISTRATION_READ_LIMIT + 1),
    );

    return onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
      const forms = querySnapshot.docs.slice(0, REGISTRATION_READ_LIMIT).map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          title:
            typeof data.title === 'string' && data.title.trim()
              ? data.title.trim()
              : null,
          name:
            typeof data.title === 'string' && data.title.trim()
              ? data.title.trim()
              : 'Form name unavailable',
          rawStatus:
            typeof data.status === 'string' ? data.status.toLocaleLowerCase() : null,
          status:
            data.status === 'archived' || data.status === 'closed'
              ? 'Closed'
              : data.status === 'active' || data.status === 'open'
                ? 'Open'
                : 'Status unavailable',
          dateCreated: timestampDateOrNull(data.createdAt),
          program: typeof data.teamId === 'string' && data.teamId.trim()
            ? data.teamId.trim()
            : null,
        };
      }).sort((a, b) => {
        if (a.dateCreated && b.dateCreated) {
          return b.dateCreated.getTime() - a.dateCreated.getTime();
        }
        if (a.dateCreated) return -1;
        if (b.dateCreated) return 1;
        return a.id.localeCompare(b.id);
      });
      onScope({
        truncated: querySnapshot.docs.length > REGISTRATION_READ_LIMIT,
        limit: REGISTRATION_READ_LIMIT,
      });
      callback(forms);
    }, (error) => {
      console.error('Registration forms could not be loaded.');
      onError(error);
    });
  }

  /**
   * Fetches participants (registrations) for a specific form.
   */
  static async fetchParticipants(tenantId: string, formId: string) {
    return (await this.fetchParticipantsPage(tenantId, formId)).records;
  }

  static async fetchParticipantsPage(tenantId: string, formId: string) {
    return (await this.fetchRegistrationDetailPage(tenantId, formId)).participants;
  }

  /**
   * Fetches events that are connected to a specific form.
   */
  static async fetchEventsForForm(tenantId: string, formId: string) {
    return (await this.fetchEventsForFormPage(tenantId, formId)).records;
  }

  static async fetchEventsForFormPage(tenantId: string, formId: string) {
    if (!tenantId || !formId) {
      return { records: [], truncated: false, limit: REGISTRATION_READ_LIMIT };
    }
    const result = await getDocs(query(
      collection(db, 'events'),
      where('tenantId', '==', tenantId),
      where('registrationFormId', '==', formId),
      orderBy(documentId()),
      limit(REGISTRATION_READ_LIMIT + 1),
    ));
    return {
      records: result.docs.slice(0, REGISTRATION_READ_LIMIT).map((entry) => ({
        id: entry.id,
        ...entry.data(),
      })),
      truncated: result.docs.length > REGISTRATION_READ_LIMIT,
      limit: REGISTRATION_READ_LIMIT,
    };
  }

  static async fetchRegistrationDetailPage(tenantId: string, formId: string) {
    const events = await this.fetchEventsForFormPage(tenantId, formId);
    const eventIds = events.records
      .map((event) => event.id)
      .filter((id): id is string => typeof id === 'string' && Boolean(id));
    if (eventIds.length === 0) {
      return {
        events,
        participants: {
          records: [],
          truncated: events.truncated,
          limit: REGISTRATION_READ_LIMIT,
        },
      };
    }

    const chunks: string[][] = [];
    for (let index = 0; index < eventIds.length; index += 30) {
      chunks.push(eventIds.slice(index, index + 30));
    }
    const snapshots = await Promise.all(chunks.map((eventIdChunk) =>
      getDocs(query(
        collection(db, 'registrations'),
        where('tenantId', '==', tenantId),
        where('eventId', 'in', eventIdChunk),
        orderBy(documentId()),
        limit(REGISTRATION_READ_LIMIT + 1),
      ))
    ));
    const deduplicated = new Map<string, any>();
    for (const snapshot of snapshots) {
      for (const entry of snapshot.docs) {
        if (deduplicated.size > REGISTRATION_READ_LIMIT) break;
        const data = entry.data();
        deduplicated.set(
          entry.id,
          registrationDisplayRecord(
            entry.id,
            data,
            timestampDateOrNull(data.createdAt),
          ),
        );
      }
    }
    const records = Array.from(deduplicated.values())
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, REGISTRATION_READ_LIMIT);
    return {
      events,
      participants: {
        records,
        truncated:
          events.truncated
          || snapshots.some((snapshot) => snapshot.docs.length > REGISTRATION_READ_LIMIT)
          || deduplicated.size > REGISTRATION_READ_LIMIT,
        limit: REGISTRATION_READ_LIMIT,
      },
    };
  }
}
