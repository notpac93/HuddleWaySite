import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  crmOperationalPage: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: apiMocks,
}));

import { RegistrationService } from '../../src/lib/services/RegistrationService';

function page(
  collection: string,
  records: Array<Record<string, unknown>>,
  hasMore = false,
  nextCursor: string | null = null,
) {
  return {
    schemaVersion: 'crm_operational_page_v1',
    tenantId: 'tenant-a',
    collection,
    records,
    hasMore,
    nextCursor,
    limit: 100,
    requestId: `request-${collection}`,
  };
}

describe('RegistrationService authenticated backend projections', () => {
  beforeEach(() => {
    apiMocks.crmOperationalPage.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does not request a page without a tenant', () => {
    const callback = vi.fn();
    const unsubscribe = RegistrationService.subscribeToForms('', callback);

    expect(callback).toHaveBeenCalledWith([]);
    expect(apiMocks.crmOperationalPage).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('loads every form page and normalizes the complete result', async () => {
    apiMocks.crmOperationalPage
      .mockResolvedValueOnce(page('registration_forms', [
        {
          id: 'form-old',
          name: 'Legacy Form',
          status: 'archived',
          createdAt: '2026-07-01T12:00:00.000Z',
        },
      ], true, 'cursor-1'))
      .mockResolvedValueOnce(page('registration_forms', [
        {
          id: 'form-new',
          title: ' Fall Registration ',
          status: 'open',
          teamId: ' 12U ',
          createdAt: '2026-07-10T12:00:00.000Z',
        },
      ]));

    const callback = vi.fn();
    RegistrationService.subscribeToForms('tenant-a', callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    expect(apiMocks.crmOperationalPage).toHaveBeenNthCalledWith(
      2,
      'tenant-a',
      'registration_forms',
      { limit: 100, cursor: 'cursor-1' },
    );
    expect(callback.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        id: 'form-new',
        title: 'Fall Registration',
        name: 'Fall Registration',
        status: 'Open',
        program: '12U',
      }),
      expect.objectContaining({
        id: 'form-old',
        name: 'Legacy Form',
        status: 'Closed',
      }),
    ]);
  });

  it('cancels stale form responses', async () => {
    let resolvePage!: (value: unknown) => void;
    apiMocks.crmOperationalPage.mockReturnValueOnce(new Promise((resolve) => {
      resolvePage = resolve;
    }));
    const callback = vi.fn();
    const unsubscribe = RegistrationService.subscribeToForms('tenant-a', callback);
    unsubscribe();
    resolvePage(page('registration_forms', [{ id: 'stale' }]));
    await Promise.resolve();
    expect(callback).not.toHaveBeenCalled();
  });

  it('loads all event pages and filters events linked to a form', async () => {
    apiMocks.crmOperationalPage
      .mockResolvedValueOnce(page('events', [
        { id: 'event-1', registrationFormId: 'form-a' },
        { id: 'event-2', registrationFormId: 'form-b' },
      ], true, 'event-cursor'))
      .mockResolvedValueOnce(page('events', [
        { id: 'event-3', registrationFormId: 'form-a' },
      ]));

    const result = await RegistrationService.fetchEventsForFormPage('tenant-a', 'form-a');
    expect(result.records.map((record) => record.id)).toEqual(['event-1', 'event-3']);
    expect(result.truncated).toBe(false);
    expect(apiMocks.crmOperationalPage).toHaveBeenCalledTimes(2);
  });

  it('returns complete participant details without raw registration answers', async () => {
    apiMocks.crmOperationalPage
      .mockResolvedValueOnce(page('events', [
        { id: 'event-1', registrationFormId: 'form-a' },
      ]))
      .mockResolvedValueOnce(page('registrations', [
        {
          id: 'registration-1',
          eventId: 'event-1',
          formId: 'form-a',
          formSubmission: { formId: 'form-a', sections: [] },
          participantSummary: { fullName: ' Player One ' },
          payerSummary: { email: 'guardian@example.test' },
          userId: 'user-1',
          status: 'submitted',
          createdAt: '2026-07-02T12:00:00.000Z',
        },
        {
          id: 'unrelated',
          eventId: 'event-other',
          formId: 'form-other',
        },
      ]));

    const result = await RegistrationService.fetchRegistrationDetailPage('tenant-a', 'form-a');
    expect(result.events.records).toHaveLength(1);
    expect(result.participants).toMatchObject({
      truncated: false,
      limit: null,
      exactCount: 1,
    });
    expect(result.participants.records[0]).toMatchObject({
      id: 'registration-1',
      participantName: 'Player One',
      email: 'guardian@example.test',
      eventId: 'event-1',
    });
    expect(result.participants.records[0]).not.toHaveProperty('formData');
    expect(apiMocks.crmOperationalPage).toHaveBeenNthCalledWith(
      2,
      'tenant-a',
      'registrations',
      { limit: 100, cursor: undefined },
    );
  });

  it('correlates a canonical form submission without trusting another tenant page', async () => {
    apiMocks.crmOperationalPage
      .mockResolvedValueOnce(page('events', []))
      .mockResolvedValueOnce(page('registrations', [
        {
          id: 'canonical-registration',
          formId: 'form-a',
          formSubmission: { formId: 'form-a', sections: [] },
          participantSummary: { fullName: 'Canonical Player' },
          payerSummary: { email: 'guardian@example.test' },
        },
        {
          id: 'different-form',
          formId: 'form-b',
          participantSummary: { fullName: 'Other Player' },
        },
      ]));

    const result = await RegistrationService.fetchRegistrationDetailPage(
      'tenant-a',
      'form-a',
    );
    expect(result.participants.records.map((record) => record.id)).toEqual([
      'canonical-registration',
    ]);
    expect(apiMocks.crmOperationalPage).toHaveBeenCalledWith(
      'tenant-a',
      'registrations',
      { limit: 100, cursor: undefined },
    );
  });

  it('propagates backend failures instead of returning a fake empty result', async () => {
    const permissionError = Object.assign(new Error('permission denied'), {
      status: 403,
      code: 'permission-denied',
    });
    apiMocks.crmOperationalPage.mockRejectedValue(permissionError);

    await expect(
      RegistrationService.fetchEventsForFormPage('tenant-a', 'form-a'),
    ).rejects.toBe(permissionError);
  });

});
