import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: { kind: 'fixture-db' },
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({
    kind: 'collection',
    name,
  }),
  documentId: () => '__name__',
  getDocs: firestoreMocks.getDocs,
  limit: (count: number) => ({ kind: 'limit', count }),
  onSnapshot: firestoreMocks.onSnapshot,
  orderBy: (field: string) => ({ kind: 'orderBy', field }),
  query: (...parts: unknown[]) => ({ kind: 'query', parts }),
  where: (field: string, operator: string, value: unknown) => ({
    kind: 'where',
    field,
    operator,
    value,
  }),
}));

import { RegistrationService } from '../../src/lib/services/RegistrationService';

function document(
  id: string,
  data: Record<string, unknown> = {},
) {
  return {
    id,
    data: () => data,
  };
}

function timestamp(value: string) {
  return {
    toDate: () => new Date(value),
  };
}

describe('RegistrationService bounded Firestore projections', () => {
  beforeEach(() => {
    firestoreMocks.getDocs.mockReset();
    firestoreMocks.onSnapshot.mockReset();
    firestoreMocks.unsubscribe.mockReset();
    firestoreMocks.onSnapshot.mockReturnValue(firestoreMocks.unsubscribe);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not open a listener without a tenant', () => {
    const callback = vi.fn();
    const unsubscribe = RegistrationService.subscribeToForms('', callback);

    expect(callback).toHaveBeenCalledWith([]);
    expect(firestoreMocks.onSnapshot).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('caps, normalizes, sorts, and reports the registration-form subscription scope', () => {
    let nextSnapshot!: (snapshot: {
      docs: Array<ReturnType<typeof document>>;
    }) => void;
    let failSnapshot!: (error: unknown) => void;
    firestoreMocks.onSnapshot.mockImplementation(
      (_source, next, error) => {
        nextSnapshot = next;
        failSnapshot = error;
        return firestoreMocks.unsubscribe;
      },
    );
    const callback = vi.fn();
    const onError = vi.fn();
    const onScope = vi.fn();

    const unsubscribe = RegistrationService.subscribeToForms(
      'tenant-a',
      callback,
      onError,
      onScope,
    );

    const sourceQuery = firestoreMocks.onSnapshot.mock.calls[0][0];
    expect(sourceQuery).toEqual({
      kind: 'query',
      parts: [
        { kind: 'collection', name: 'registration_forms' },
        {
          kind: 'where',
          field: 'tenantId',
          operator: '==',
          value: 'tenant-a',
        },
        { kind: 'orderBy', field: '__name__' },
        { kind: 'limit', count: 501 },
      ],
    });

    const filler = Array.from({ length: 498 }, (_, index) =>
      document(`filler-${String(index).padStart(3, '0')}`, {
        title: `Filler ${index}`,
        status: 'active',
      }),
    );
    nextSnapshot({
      docs: [
        document('form-archived', {
          title: '   ',
          status: 'archived',
          createdAt: { toDate: () => new Date('invalid') },
        }),
        document('form-open', {
          title: ' Fall Registration ',
          status: 'open',
          teamId: ' 12U ',
          createdAt: timestamp('2026-07-01T12:00:00.000Z'),
        }),
        document('form-unknown', {
          title: 'Imported Form',
          status: 'migrating',
          createdAt: timestamp('2026-07-10T12:00:00.000Z'),
        }),
        ...filler,
      ],
    });

    expect(onScope).toHaveBeenCalledWith({
      truncated: true,
      limit: 500,
    });
    expect(callback).toHaveBeenCalledTimes(1);
    const forms = callback.mock.calls[0][0];
    expect(forms).toHaveLength(500);
    expect(forms[0]).toMatchObject({
      id: 'form-unknown',
      name: 'Imported Form',
      rawStatus: 'migrating',
      status: 'Status unavailable',
    });
    expect(forms.find((form: { id: string }) => form.id === 'form-open'))
      .toMatchObject({
        title: 'Fall Registration',
        name: 'Fall Registration',
        rawStatus: 'open',
        status: 'Open',
        program: '12U',
      });
    expect(
      forms.find((form: { id: string }) => form.id === 'form-archived'),
    ).toMatchObject({
      name: 'Form name unavailable',
      status: 'Closed',
      dateCreated: null,
      program: null,
    });

    const permissionError = { code: 'firestore/permission-denied' };
    failSnapshot(permissionError);
    expect(onError).toHaveBeenCalledWith(permissionError);
    unsubscribe();
    expect(firestoreMocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('caps connected events and returns an empty participant scope for invalid or unlinked forms', async () => {
    expect(
      await RegistrationService.fetchEventsForFormPage('', 'form-a'),
    ).toEqual({
      records: [],
      truncated: false,
      limit: 500,
    });
    expect(firestoreMocks.getDocs).not.toHaveBeenCalled();

    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: Array.from({ length: 501 }, (_, index) =>
        document(`event-${String(index).padStart(3, '0')}`, {
          tenantId: 'tenant-a',
          title: `Event ${index}`,
        }),
      ),
    });
    const events = await RegistrationService.fetchEventsForFormPage(
      'tenant-a',
      'form-a',
    );
    expect(events.records).toHaveLength(500);
    expect(events.truncated).toBe(true);
    expect(firestoreMocks.getDocs.mock.calls[0][0]).toEqual({
      kind: 'query',
      parts: [
        { kind: 'collection', name: 'events' },
        {
          kind: 'where',
          field: 'tenantId',
          operator: '==',
          value: 'tenant-a',
        },
        {
          kind: 'where',
          field: 'registrationFormId',
          operator: '==',
          value: 'form-a',
        },
        { kind: 'orderBy', field: '__name__' },
        { kind: 'limit', count: 501 },
      ],
    });

    firestoreMocks.getDocs.mockReset();
    firestoreMocks.getDocs.mockResolvedValueOnce({ docs: [] });
    const emptyDetail =
      await RegistrationService.fetchRegistrationDetailPage(
        'tenant-a',
        'form-a',
      );
    expect(emptyDetail.participants).toEqual({
      records: [],
      truncated: false,
      limit: 500,
    });
    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(1);
  });

  it('chunks event IDs by 30, deduplicates registrations, and emits only the safe display projection', async () => {
    const eventDocs = Array.from({ length: 61 }, (_, index) =>
      document(`event-${String(index + 1).padStart(2, '0')}`, {
        title: `Event ${index + 1}`,
      }),
    );
    firestoreMocks.getDocs
      .mockResolvedValueOnce({ docs: eventDocs })
      .mockResolvedValueOnce({
        docs: [
          document('registration-b', {
            participantSummary: { fullName: ' Player B ' },
            payerSummary: {
              email: ' guardian-b@example.test ',
            },
            userId: ' user-b ',
            eventId: 'event-01',
            status: ' submitted ',
            createdAt: timestamp('2026-07-02T12:00:00.000Z'),
            formData: { medicalNotes: 'must not be exposed' },
          }),
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          document('registration-a', {
            firstName: 'Player',
            lastName: 'A',
            email: 'player-a@example.test',
            eventId: 'event-31',
            createdAt: timestamp('2026-07-01T12:00:00.000Z'),
          }),
          document('registration-b', {
            participantName: 'Replacement Player B',
            eventId: 'event-32',
          }),
        ],
      })
      .mockResolvedValueOnce({ docs: [] });

    const detail = await RegistrationService.fetchRegistrationDetailPage(
      'tenant-a',
      'form-a',
    );

    expect(firestoreMocks.getDocs).toHaveBeenCalledTimes(4);
    const registrationQueries = firestoreMocks.getDocs.mock.calls
      .slice(1)
      .map((call) => call[0]);
    expect(
      registrationQueries.map((sourceQuery) =>
        sourceQuery.parts.find(
          (part: { field?: string }) => part.field === 'eventId',
        ).value.length
      ),
    ).toEqual([30, 30, 1]);
    for (const sourceQuery of registrationQueries) {
      expect(sourceQuery.parts).toContainEqual({
        kind: 'where',
        field: 'tenantId',
        operator: '==',
        value: 'tenant-a',
      });
      expect(sourceQuery.parts).toContainEqual({
        kind: 'limit',
        count: 501,
      });
    }

    expect(detail.events.records).toHaveLength(61);
    expect(detail.participants.truncated).toBe(false);
    expect(detail.participants.records).toEqual([
      expect.objectContaining({
        id: 'registration-a',
        participantName: 'Player A',
        email: 'player-a@example.test',
      }),
      expect.objectContaining({
        id: 'registration-b',
        participantName: 'Replacement Player B',
        eventId: 'event-32',
      }),
    ]);
    expect(detail.participants.records[0]).not.toHaveProperty('formData');
    expect(detail.participants.records[1]).not.toHaveProperty('formData');
  });

  it('propagates query failures instead of fabricating an empty success', async () => {
    const permissionError = Object.assign(
      new Error('permission denied'),
      { code: 'firestore/permission-denied' },
    );
    firestoreMocks.getDocs.mockRejectedValue(permissionError);

    await expect(
      RegistrationService.fetchRegistrationDetailPage(
        'tenant-a',
        'form-a',
      ),
    ).rejects.toBe(permissionError);
  });
});
