import { describe, expect, it, vi } from 'vitest';
import {
  BackendApi,
  BackendApiError,
} from '../../src/lib/api/BackendApi';
import { RegistrationOutreachApi } from '../../src/lib/api/RegistrationOutreachApi';

function response(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function validDirectInvoice() {
  return {
    id: 'invoice-1',
    invoiceNumber: 'HW-2026-0001',
    title: 'Registration',
    memo: null,
    status: 'open',
    agingBucket: 'not_due',
    recipientUid: null,
    recipientName: 'Parent One',
    recipientEmail: 'parent@example.test',
    lineItems: [
      {
        id: 'line-1',
        description: 'Program fee',
        quantity: 1,
        unitAmountCents: 12_500,
        amountCents: 12_500,
      },
    ],
    currency: 'USD',
    subtotalCents: 12_500,
    discountCents: 0,
    taxRateBps: 0,
    taxCents: 0,
    totalCents: 12_500,
    amountPaidCents: 0,
    amountRefundedCents: 0,
    amountDueCents: 12_500,
    dueAt: null,
    issuedAt: null,
    paidAt: null,
    voidedAt: null,
    createdAt: '2026-07-26T00:00:00.000Z',
    updatedAt: '2026-07-26T00:00:00.000Z',
    hostedInvoiceUrl: null,
    invoicePdfUrl: null,
    stripeInvoiceId: null,
    reminderCount: 0,
    manualPaymentCount: 0,
    refundCount: 0,
    lastPaymentAt: null,
    lastRefundAt: null,
    issueError: null,
    accountingReconciliationRequired: false,
    accountingReconciledAt: null,
  };
}

function validAppConfiguration() {
  return {
    name: 'Fixture Athletics',
    primaryColor: '#112233',
    secondaryColor: '#223344',
    tertiaryColor: '#ffffff',
    logoUrl: 'https://cdn.example.test/logo.png',
    navigationTabs: [{
      key: 'home',
      pageId: 'home_page',
      route: '/',
      label: 'Home',
      enabled: true,
    }],
  };
}

describe('BackendApi', () => {
  it('loads the minimum live CRM authorization projection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      tenantAccess: [{ tenantId: 'fixture-tenant', role: 'owner' }],
      canViewTenantOperations: false,
      tenantOperationsRole: null,
      requestId: 'authorization-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      getAppCheckToken: async () => 'app-check-token',
      requireAppCheck: true,
    });

    await expect(api.crmAuthorization()).resolves.toEqual({
      tenantAccess: [{ tenantId: 'fixture-tenant', role: 'owner' }],
      canViewTenantOperations: false,
      tenantOperationsRole: null,
      requestId: 'authorization-request',
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/crm/authorization',
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer token',
      'X-Firebase-AppCheck': 'app-check-token',
    });
  });

  it('loads and replies to tenant-scoped consumer admin inbox threads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        threads: [{
          id: 'thread-1',
          consumerEmail: 'family@example.test',
          consumerName: 'Family One',
          threadRecipientEmail: 'coach@example.test',
          subject: 'Question',
          lastMessageAt: '2026-08-24T10:00:00.000Z',
          messages: [{
            id: 'message-1',
            direction: 'consumer',
            senderName: 'Family One',
            subject: 'Question',
            message: 'When is practice?',
            createdAt: '2026-08-24T10:00:00.000Z',
            requestId: 'source-request',
            deliveryProvider: 'resend',
          }],
        }],
        truncated: false,
        requestId: 'list-request',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        replyId: 'reply-1',
        senderAddress: 'coach@example.test',
        requestId: 'reply-request',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await expect(api.adminInboxThreads('fixture-tenant')).resolves.toMatchObject({
      threads: [{ id: 'thread-1' }],
    });
    await expect(api.replyAdminInbox({
      tenantId: 'fixture-tenant',
      consumerEmail: 'family@example.test',
      threadRecipientEmail: 'coach@example.test',
      subject: 'Re: Question',
      message: 'Practice starts at six.',
      requestId: 'source-request',
    })).resolves.toMatchObject({ replyId: 'reply-1' });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/admin/inbox/threads?tenantId=fixture-tenant',
    );
  });

  it('reconciles one tenant invoice through the provider-backed command', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(200, {
      success: true,
      tenantId: 'fixture-tenant',
      invoice: validDirectInvoice(),
      requestId: 'reconcile-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    await expect(api.reconcileDirectInvoice(
      'fixture-tenant',
      'invoice-1',
      'Refresh provider totals.',
    )).resolves.toMatchObject({ id: 'invoice-1' });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toMatchObject({
      tenantId: 'fixture-tenant',
      auditReason: 'Refresh provider totals.',
    });
  });

  it('previews roster participants without creating records', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(200, {
      success: true,
      tenantId: 'fixture-tenant',
      validCount: 1,
      rejectedCount: 1,
      rows: [
        { rowNumber: 2, participantName: 'Jordan Player', registrationEmail: 'parent@example.test', status: 'valid', reasonCode: null, message: null },
        { rowNumber: 3, participantName: 'Existing Player', registrationEmail: 'existing@example.test', status: 'rejected', reasonCode: 'duplicate_roster_participant', message: 'Already in the program.' },
      ],
      requestId: 'preview-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const rows = [
      { rowNumber: 2, formData: { player_name: 'Jordan Player', parent_email: 'parent@example.test' } },
      { rowNumber: 3, formData: { player_name: 'Existing Player', parent_email: 'existing@example.test' } },
    ];

    await expect(api.previewRosterParticipants(
      'fixture-tenant',
      rows,
    )).resolves.toMatchObject({ validCount: 1, rejectedCount: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/roster/participants/preview',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      rows,
    });
  });

  it('imports roster participants through the tenant-scoped idempotent route', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(201, {
      tenantId: 'fixture-tenant',
      batchId: 'batch-1',
      savedCount: 1,
      registrationIds: ['registration-1'],
      idempotentReplay: false,
      requestId: 'import-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      createRequestId: () => 'browser-request',
    });
    const rows = [{ rowNumber: 2, formData: {
      player_name: 'Jordan Player',
      parent_email: 'parent@example.test',
    } }];

    await expect(api.importRosterParticipants(
      'fixture-tenant',
      rows,
      'batch-1',
    )).resolves.toMatchObject({ savedCount: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/roster/participants/import',
    );
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('batch-1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      rows,
      batchId: 'batch-1',
    });
  });

  it('uploads image files through a protected reservation and verified completion', async () => {
    const reservationId = `image_upload_${'a'.repeat(40)}`;
    const storagePath = `private/fixture-tenant/media/events/${reservationId}.png`;
    const previewUrl = 'https://storage.googleapis.test/signed-preview';
    const file = new File(['image-bytes'], 'event-cover.png', {
      type: 'image/png',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(201, {
        success: true,
        tenantId: 'fixture-tenant',
        reservationId,
        storagePath,
        uploadUrl: 'https://storage.googleapis.test/signed-write',
        contentType: 'image/png',
        expiresAt: '2030-08-01T12:15:00.000Z',
        requestId: 'image-reservation-request',
      }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        reservationId,
        storagePath,
        contentType: 'image/png',
        sizeBytes: file.size,
        storageGeneration: '123',
        status: 'verified_private',
        previewUrl,
        previewExpiresAt: '2030-08-01T12:20:00.000Z',
        idempotentReplay: false,
        requestId: 'image-completion-request',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      createRequestId: () => 'browser-request',
    });

    await expect(api.uploadImageAsset(
      'fixture-tenant',
      file,
      'event-cover',
      'image-upload:stable',
    )).resolves.toMatchObject({ previewUrl, storagePath });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/crm/images/upload-reservations',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      purpose: 'event-cover',
      fileName: 'event-cover.png',
      contentType: 'image/png',
      sizeBytes: file.size,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      idempotencyKey: 'image-upload:stable',
    });
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://storage.googleapis.test/signed-write',
      expect.objectContaining({
        method: 'PUT',
        body: file,
        credentials: 'omit',
        headers: { 'Content-Type': 'image/png' },
      }),
    ]);
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      `/admin/crm/images/upload-reservations/${reservationId}/complete`,
    );
    expect(fetchMock.mock.calls[2][1].headers['Idempotency-Key']).toBe(
      'image-upload:stable:complete',
    );
  });

  it('binds a verified event image through the backend publication route', async () => {
    const reservationId = `image_upload_${'b'.repeat(40)}`;
    const fetchMock = vi.fn().mockResolvedValueOnce(response(200, {
      success: true,
      tenantId: 'fixture-tenant',
      reservationId,
      publicationId: reservationId,
      resourceType: 'event',
      resourceIds: ['event-1', 'event-2'],
      status: 'published',
      isVisible: true,
      publicUrl: `https://api.example.test/public/media/fixture-tenant/${reservationId}`,
      idempotentReplay: false,
      operationId: 'media_publish_fixture',
      requestId: 'media-publish-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      createRequestId: () => 'browser-request',
    });

    await expect(api.publishImageAsset(
      'fixture-tenant',
      reservationId,
      'event',
      ['event-1', 'event-2'],
      'Publish the verified event cover.',
      'image-publish:stable',
    )).resolves.toMatchObject({
      reservationId,
      status: 'published',
      isVisible: true,
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `https://api.example.test/admin/crm/images/upload-reservations/${reservationId}/publish`,
    );
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      'image-publish:stable',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      resourceType: 'event',
      resourceIds: ['event-1', 'event-2'],
      auditReason: 'Publish the verified event cover.',
      idempotencyKey: 'image-publish:stable',
    });
  });

  it('publishes and manages reusable media through audited backend contracts', async () => {
    const reservationId = `image_upload_${'c'.repeat(40)}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        reservationId,
        publicationId: reservationId,
        resourceType: 'program_media',
        resourceIds: [reservationId],
        status: 'published',
        isVisible: true,
        publicUrl: `https://api.example.test/public/media/fixture-tenant/${reservationId}`,
        idempotentReplay: false,
        operationId: 'media-library-publish',
        requestId: 'media-library-request',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        idempotentReplay: false,
        operationId: 'media-update-operation',
        id: reservationId,
        updated: true,
        requestId: 'media-update-request',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        idempotentReplay: false,
        operationId: 'media-delete-operation',
        id: reservationId,
        archived: true,
        requestId: 'media-delete-request',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const metadata = {
      fileName: 'team-banner.png',
      category: 'Banners',
      purpose: 'Reusable team banner',
      altText: 'Players warming up',
      width: 1200,
      height: 800,
    };

    await expect(api.publishProgramMedia(
      'fixture-tenant', reservationId, metadata,
      'Add reviewed reusable media.', 'media-publish:stable',
    )).resolves.toMatchObject({ resourceType: 'program_media' });
    await expect(api.updateMedia(
      'fixture-tenant', reservationId,
      {
        fileName: 'team-banner-updated.png',
        category: metadata.category,
        purpose: metadata.purpose,
        altText: metadata.altText,
      },
      'Correct reusable media metadata.', 'media-update:stable',
    )).resolves.toMatchObject({ updated: true });
    await expect(api.deleteMedia(
      'fixture-tenant', reservationId,
      'Archive an unused duplicate image.', 'media-delete:stable',
    )).resolves.toMatchObject({ archived: true });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      resourceType: 'program_media',
      metadata,
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      action: 'media.update',
      resourceId: reservationId,
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      action: 'media.delete',
      resourceId: reservationId,
    });
  });

  it('uses bearer auth, tenant query scope, and one forced-token retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401, { error: 'expired' }))
      .mockResolvedValueOnce(
        response(200, {
          tenantId: 'fixture-tenant',
          scope: 'tenant',
          payments: [],
          invoices: [],
        }),
      );
    const getIdToken = vi
      .fn()
      .mockResolvedValueOnce('token-old')
      .mockResolvedValueOnce('token-new');
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken,
      createRequestId: () => 'request-1',
    });

    await expect(api.billingHistory('fixture-tenant', 25)).resolves.toMatchObject({
      tenantId: 'fixture-tenant',
      scope: 'tenant',
    });
    expect(getIdToken.mock.calls).toEqual([[false], [true]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, request] = fetchMock.mock.calls[1];
    expect(String(url)).toContain('tenantId=fixture-tenant');
    expect(String(url)).toContain('limit=25');
    expect(request.headers.Authorization).toBe('Bearer token-new');
    expect(request.headers['X-Request-Id']).toBe('request-1');
  });

  it('keeps the same idempotency key across an authorization retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403, { error: 'refresh required' }))
      .mockResolvedValueOnce(
        response(200, {
          invoice: validDirectInvoice(),
          requestId: 'invoice-create-request',
        }),
      );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      createRequestId: () => 'request-2',
    });

    await api.createDirectInvoice(
      {
        tenantId: 'fixture-tenant',
        auditReason: 'Created an invoice draft from the Operations Portal.',
        recipientEmail: 'payer@example.test',
        title: 'Registration',
        dueDays: 30,
        lineItems: [
          {
            description: 'Program fee',
            quantity: 1,
            unitAmountCents: 12500,
          },
        ],
      },
      'invoice:fixture-operation',
    );

    for (const call of fetchMock.mock.calls) {
      expect(call[1].headers['Idempotency-Key']).toBe(
        'invoice:fixture-operation',
      );
      expect(JSON.parse(call[1].body)).toMatchObject({
        tenantId: 'fixture-tenant',
        idempotencyKey: 'invoice:fixture-operation',
      });
      expect(JSON.parse(call[1].body)).toMatchObject({
        auditReason: 'Created an invoice draft from the Operations Portal.',
      });
    }
  });

  it('sends mandatory operator reasons and stable idempotency on financial mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          invoice: validDirectInvoice(),
          requestId: 'invoice-action-request',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          invoice: validDirectInvoice(),
          requestId: 'manual-payment-request',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          success: true,
          transactionId: 'transaction-1',
          refund: { id: 'refund-1' },
          requestId: 'request-refund',
        }),
      );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      createRequestId: () => 'request-finance',
    });

    await api.directInvoiceAction(
      'fixture-tenant',
      'invoice-1',
      'remind',
      'remind:stable',
      'Family asked for another copy.',
    );
    await api.recordManualPayment({
      tenantId: 'fixture-tenant',
      invoiceId: 'invoice-1',
      amountCents: 12_500,
      method: 'check',
      reference: 'check-1042',
      note: 'Check received by the program director.',
      auditReason: 'Check received by the program director.',
      receivedAt: '2026-07-26T12:00:00.000Z',
      idempotencyKey: 'manual:stable',
    });
    await api.refundTransaction({
      tenantId: 'fixture-tenant',
      transactionId: 'transaction-1',
      amountCents: 2_500,
      reason: 'requested_by_customer',
      note: 'Guardian requested the approved partial refund.',
      idempotencyKey: 'refund:stable',
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      idempotencyKey: 'remind:stable',
      auditReason: 'Family asked for another copy.',
    });
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(
      'remind:stable',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      amountCents: 12_500,
      reference: 'check-1042',
      auditReason: 'Check received by the program director.',
      idempotencyKey: 'manual:stable',
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      transactionId: 'transaction-1',
      amountCents: 2_500,
      reason: 'requested_by_customer',
      note: 'Guardian requested the approved partial refund.',
    });
  });

  it('sends and refreshes App Check with the authenticated retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403, { error: 'refresh required' }))
      .mockResolvedValueOnce(
        response(200, {
          tenantId: 'fixture-tenant',
          scope: 'tenant',
          payments: [],
          invoices: [],
        }),
      );
    const getAppCheckToken = vi
      .fn()
      .mockResolvedValueOnce('app-check-old')
      .mockResolvedValueOnce('app-check-new');
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'id-token',
      getAppCheckToken,
      requireAppCheck: true,
    });

    await api.billingHistory('fixture-tenant');

    expect(getAppCheckToken.mock.calls).toEqual([[false], [true]]);
    expect(fetchMock.mock.calls[0][1].headers['X-Firebase-AppCheck']).toBe(
      'app-check-old',
    );
    expect(fetchMock.mock.calls[1][1].headers['X-Firebase-AppCheck']).toBe(
      'app-check-new',
    );
  });

  it('fails closed before fetch when required App Check is unavailable', async () => {
    const fetchMock = vi.fn();
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'id-token',
      getAppCheckToken: async () => '',
      requireAppCheck: true,
    });

    await expect(api.billingHistory('fixture-tenant')).rejects.toThrow(
      'App Check verification is required.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads roster and redacted audit projections through tenant-scoped routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          tenantId: 'fixture-tenant',
          teamId: 'team-1',
          players: [
            {
              id: 'registration-1',
              name: 'Jordan Player',
              teamIds: ['team-1'],
            },
          ],
          truncated: {
            registrations: false,
            memberships: false,
            teams: false,
          },
          requestId: 'roster-request',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          events: [
            {
              id: 'audit-1',
              action: 'refund',
              actorLabel: 'owner',
            },
          ],
          truncated: false,
          hasMore: false,
          nextCursor: null,
          limit: 25,
          requestId: 'audit-request',
        }),
      );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await expect(api.rosterPlayers('fixture-tenant', 'team-1')).resolves.toHaveLength(1);
    await expect(api.auditEvents('fixture-tenant', 25)).resolves.toHaveLength(1);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/admin/roster/players?tenantId=fixture-tenant&teamId=team-1',
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/admin/crm/audit-events?tenantId=fixture-tenant&limit=25',
    );
  });

  it('previews and commits one atomic multi-team roster transfer', async () => {
    const preview = {
      destinationTeamId: 'team-2',
      registrationIds: ['registration-1', 'registration-2'],
      rows: [
        {
          registrationId: 'registration-1',
          label: 'Jordan Player',
          beforeTeamIds: ['team-1'],
          afterTeamIds: ['team-2'],
          addTeamIds: ['team-2'],
          removeTeamIds: ['team-1'],
          noOp: false,
        },
      ],
      changes: [
        {
          registrationId: 'registration-1',
          membershipId: 'membership-1',
          teamId: 'team-1',
          action: 'remove' as const,
        },
      ],
      changeSetHash: 'a'.repeat(64),
      affectedTeamIds: ['team-1', 'team-2'],
      addCount: 1,
      removeCount: 2,
      noOpCount: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          tenantId: 'fixture-tenant',
          preview,
          requestId: 'transfer-preview-request',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          success: true,
          idempotentReplay: false,
          tenantId: 'fixture-tenant',
          operationId: 'roster_transfer_one',
          auditEventId: 'audit-one',
          preview,
          requestId: 'transfer-commit-request',
        }),
      );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      getAppCheckToken: async () => 'app-check-token',
    });

    const reviewed = await api.previewRosterTransfer(
      'fixture-tenant',
      ['registration-1', 'registration-2'],
      'team-2',
    );
    await api.commitRosterTransfer(
      'fixture-tenant',
      reviewed,
      'roster-transfer:stable',
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/admin/roster/transfers/preview',
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)),
    ).toEqual({
      tenantId: 'fixture-tenant',
      registrationIds: ['registration-1', 'registration-2'],
      destinationTeamId: 'team-2',
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/admin/roster/transfers/commit',
    );
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'Idempotency-Key': 'roster-transfer:stable',
      'X-Idempotency-Key': 'roster-transfer:stable',
      'X-Firebase-AppCheck': 'app-check-token',
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1]?.body)),
    ).toEqual({
      tenantId: 'fixture-tenant',
      registrationIds: preview.registrationIds,
      destinationTeamId: 'team-2',
      changeSetHash: preview.changeSetHash,
    });
  });

  it('assigns registrations to a season with a stable operation key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        success: true,
        idempotentReplay: false,
        tenantId: 'fixture-tenant',
        seasonId: 'season/fall',
        registrationIds: ['registration-1'],
        assignedCount: 1,
        alreadyAssignedCount: 0,
        operationId: 'season_assignment_one',
        auditEventId: 'audit-season-one',
        requestId: 'season-assignment-request',
      }),
    );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      getAppCheckToken: async () => 'app-check-token',
    });

    await api.assignSeasonParticipants(
      'fixture-tenant',
      'season/fall',
      ['registration-1'],
      'season-assignment:stable',
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/admin/seasons/season%2Ffall/participants/assign',
    );
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'Idempotency-Key': 'season-assignment:stable',
      'X-Idempotency-Key': 'season-assignment:stable',
      'X-Firebase-AppCheck': 'app-check-token',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      tenantId: 'fixture-tenant',
      registrationIds: ['registration-1'],
    });
  });

  it('validates and commits a tenant-scoped team roster preview', async () => {
    const preview = {
      teamId: 'team-1',
      changes: [
        { registrationId: 'registration-1', action: 'add' as const },
      ],
      rows: [{ registrationId: 'registration-1', noOp: false }],
      changeSetHash: 'b'.repeat(64),
      addCount: 1,
      removeCount: 0,
      noOpCount: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, {
        tenantId: 'fixture-tenant',
        preview,
        requestId: 'roster-preview-request',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        operationId: 'roster-operation-1',
        preview,
        requestId: 'roster-commit-request',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      getAppCheckToken: async () => 'app-check-token',
    });

    const reviewed = await api.previewRosterChanges(
      'fixture-tenant',
      'team-1',
      preview.changes,
    );
    await expect(
      api.commitRosterChanges(
        'fixture-tenant',
        'team-1',
        reviewed,
        'roster-team:stable',
      ),
    ).resolves.toMatchObject({
      success: true,
      tenantId: 'fixture-tenant',
      operationId: 'roster-operation-1',
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      changes: preview.changes,
    });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      'Idempotency-Key': 'roster-team:stable',
      'X-Idempotency-Key': 'roster-team:stable',
      'X-Firebase-AppCheck': 'app-check-token',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      changes: preview.changes,
      changeSetHash: preview.changeSetHash,
    });
  });

  it.each([
    [
      'a different tenant',
      {
        tenantId: 'other-tenant',
        preview: {
          teamId: 'team-1',
          changes: [],
          rows: [],
          changeSetHash: 'b'.repeat(64),
          addCount: 0,
          removeCount: 0,
          noOpCount: 0,
        },
        requestId: 'wrong-tenant-request',
      },
    ],
    [
      'an invalid roster preview',
      {
        tenantId: 'fixture-tenant',
        preview: {
          teamId: 'team-1',
          changes: [],
          rows: [],
          changeSetHash: 'not-a-review-hash',
          addCount: 0,
          removeCount: 0,
          noOpCount: 0,
        },
        requestId: 'invalid-preview-request',
      },
    ],
  ])('rejects team roster success for %s', async (_label, payload) => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () => response(200, payload),
      getIdToken: async () => 'token',
    });

    await expect(
      api.previewRosterChanges('fixture-tenant', 'team-1', [
        { registrationId: 'registration-1', action: 'add' },
      ]),
    ).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: payload.requestId,
    });
  });

  it('previews, lists, closes, and reopens tenant-scoped financial periods', async () => {
    const preview = {
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      collections: {
        transactions: { count: 2, totalCents: 25_000, truncated: false },
      },
      truncated: false,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          tenantId: 'fixture-tenant',
          preview,
          requestId: 'preview-request',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          tenantId: 'fixture-tenant',
          periods: [],
          truncated: false,
          limit: 100,
          requestId: 'list-request',
        }),
      )
      .mockResolvedValueOnce(
        response(201, {
          success: true,
          idempotentReplay: false,
          periodId: 'period-1',
          status: 'closed',
          preview,
          requestId: 'close-request',
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          success: true,
          idempotentReplay: false,
          periodId: 'period-1',
          status: 'reopened',
          requestId: 'reopen-request',
        }),
      );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const period = {
      label: 'January 2026',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    };

    await api.previewFinancialPeriod('fixture-tenant', period);
    await api.financialPeriods('fixture-tenant', 100);
    await api.closeFinancialPeriod(
      'fixture-tenant',
      period,
      'Month-end review is complete.',
      'period-close:stable',
    );
    await api.reopenFinancialPeriod(
      'fixture-tenant',
      'period-1',
      'A correction is required.',
      'period-reopen:stable',
    );

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/admin/financial-periods/preview',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      period,
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/admin/financial-periods?tenantId=fixture-tenant&limit=100',
    );
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      period,
      auditReason: 'Month-end review is complete.',
      idempotencyKey: 'period-close:stable',
    });
    expect(fetchMock.mock.calls[2][1].headers['Idempotency-Key']).toBe(
      'period-close:stable',
    );
    expect(String(fetchMock.mock.calls[3][0])).toContain(
      '/admin/financial-periods/period-1/reopen',
    );
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      auditReason: 'A correction is required.',
      idempotencyKey: 'period-reopen:stable',
    });
  });

  it('recalls a message with one stable idempotency key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403, { error: 'refresh required' }))
      .mockResolvedValueOnce(
        response(200, {
          success: true,
          idempotentReplay: true,
          messageId: 'message-1',
          requestId: 'recall-request',
        }),
      );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      getAppCheckToken: async () => 'app-check-token',
    });

    await expect(
      api.recallMessage(
        'fixture-tenant',
        'message-1',
        'message-recall:stable',
        'Superseded announcement',
      ),
    ).resolves.toMatchObject({
      idempotentReplay: true,
      messageId: 'message-1',
      requestId: 'recall-request',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('/admin/messages/message-1/recall');
      expect(call[1].headers).toMatchObject({
        'Idempotency-Key': 'message-recall:stable',
        'X-Idempotency-Key': 'message-recall:stable',
        'X-Firebase-AppCheck': 'app-check-token',
      });
      expect(JSON.parse(call[1].body)).toEqual({
        tenantId: 'fixture-tenant',
        idempotencyKey: 'message-recall:stable',
        auditReason: 'Superseded announcement',
      });
    }
  });

  it('previews an announcement audience without publishing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      success: true,
      tenantId: 'fixture-tenant',
      scope: 'tenant_account_holders',
      eligibleAccountCount: 12,
      eligibleDeviceCount: 9,
      truncated: false,
      requestId: 'announcement-preview-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await expect(
      api.announcementAudiencePreview('fixture-tenant'),
    ).resolves.toMatchObject({
      eligibleAccountCount: 12,
      eligibleDeviceCount: 9,
      truncated: false,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/messages/announcement-preview',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
    });
  });

  it('validates app-configuration read and publish envelopes', async () => {
    const configuration = validAppConfiguration();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, {
        tenantId: 'fixture-tenant',
        mode: 'update',
        configVersion: 7,
        publishedAt: '2026-07-01T12:00:00.000Z',
        publishedBy: 'owner-1',
        versionToken: 'version-before',
        configuration,
        requestId: 'configuration-read',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        operationId: 'configuration-operation',
        idempotentReplay: false,
        id: 'fixture-tenant',
        mode: 'update',
        versionToken: 'version-after',
        publicationSyncStatus: 'succeeded',
        configuration,
        requestId: 'configuration-publish',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await expect(
      api.appConfiguration('fixture-tenant'),
    ).resolves.toMatchObject({
      tenantId: 'fixture-tenant',
      versionToken: 'version-before',
    });
    await expect(
      api.publishAppConfiguration(
        'fixture-tenant',
        {
          ...configuration,
          mode: 'update',
          expectedVersionToken: 'version-before',
        },
        'Publish reviewed app configuration.',
        'app-configuration:stable',
      ),
    ).resolves.toMatchObject({
      id: 'fixture-tenant',
      versionToken: 'version-after',
    });
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe(
      'app-configuration:stable',
    );
  });

  it('loads and publishes a tenant-scoped component studio layout', async () => {
    const pages = [{
      id: 'home_page', title: 'Home', headline: '', subheader: '', route: '/',
      isVisible: true, status: 'published',
      components: [{
        id: 'home_hero_1', definitionId: 'home_hero', definitionVersion: 3,
        type: 'hero_section', label: 'Home Hero', enabled: true,
        presetId: null, starterContentReviewKey: null, isVisible: true,
        status: 'draft', content: { headline: 'Welcome' },
      }],
    }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {
        tenantId: 'fixture-tenant', templateId: 'huddleway_base_v1',
        templateVersion: 4, versionToken: 'layout-before',
        definitions: [{
          id: 'home_hero', type: 'hero_section', label: 'Home Hero',
          category: 'Welcome', definitionVersion: 3, repeatable: false,
          fields: [{ id: 'headline', type: 'text', required: true }],
          defaultContent: { headline: 'Welcome' }, presets: [],
          previewSpec: { title: 'Home Hero', description: '', highlights: [] },
        }],
        pages,
        requestId: 'component-studio-read',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true, operationId: 'component-layout-operation',
        idempotentReplay: false, requestId: 'component-layout-publish',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await expect(api.componentStudio('fixture-tenant')).resolves.toMatchObject({
      tenantId: 'fixture-tenant', versionToken: 'layout-before',
    });
    await expect(api.publishPageLayout('fixture-tenant', {
      templateId: 'huddleway_base_v1', templateVersion: 4,
      expectedVersionToken: 'layout-before', pages,
      stalePageIds: [], staleComponentIds: [],
    }, 'Publish reviewed component layout.', 'component-layout:stable'))
      .resolves.toMatchObject({ operationId: 'component-layout-operation' });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/crm/component-studio?tenantId=fixture-tenant',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      action: 'page_layout.publish_full',
      resourceId: 'huddleway_base_v1',
      data: {
        expectedVersionToken: 'layout-before',
        pages: [{ components: [expect.not.objectContaining({ status: 'draft' })] }],
      },
    });
  });

  it('loads and validates retained app-configuration history', async () => {
    const configuration = validAppConfiguration();
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      tenantId: 'fixture-tenant',
      versions: [{
        id: 'fixture-tenant__00000007',
        configVersion: 7,
        publishedAt: '2026-07-01T12:00:00.000Z',
        publishedBy: 'owner-1',
        auditReason: 'Published reviewed app configuration.',
        configuration,
      }],
      truncated: false,
      requestId: 'configuration-history',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await expect(api.appConfigurationHistory('fixture-tenant')).resolves.toMatchObject({
      versions: [expect.objectContaining({ configVersion: 7 })],
      truncated: false,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/crm/app-configuration/history?tenantId=fixture-tenant',
    );
  });

  it.each([
    {
      tenantId: 'other-tenant',
      mode: 'update',
      versionToken: 'version-1',
      configuration: validAppConfiguration(),
      requestId: 'wrong-config-tenant',
    },
    {
      tenantId: 'fixture-tenant',
      mode: 'update',
      versionToken: 'version-1',
      configuration: {
        ...validAppConfiguration(),
        navigationTabs: [{
          key: 'unsafe',
          pageId: 'unsafe_page',
          route: '//external.example.test',
          label: 'Unsafe',
          enabled: true,
        }],
      },
      requestId: 'invalid-config-route',
    },
  ])('rejects malformed app-configuration readback', async (payload) => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () => response(200, payload),
      getIdToken: async () => 'token',
    });
    await expect(
      api.appConfiguration('fixture-tenant'),
    ).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: payload.requestId,
    });
  });

  it('validates staff directory and lifecycle response identity', async () => {
    const staffDirectory = {
      tenantId: 'fixture-tenant',
      staff: [{
        membershipId: 'membership-1',
        uid: 'staff-1',
        role: 'editor',
        status: 'active',
        active: true,
        displayName: 'Staff One',
        email: 'staff@example.test',
        emailVerified: true,
        joinedAt: null,
        updatedAt: null,
      }],
      pendingInvites: [{
        id: 'invite-1',
        email: 'invite@example.test',
        role: 'viewer',
        status: 'pending',
        displayName: null,
        createdAt: null,
        expiresAt: null,
      }],
      truncated: { staff: false, pendingInvites: false },
      requestId: 'staff-directory',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, staffDirectory))
      .mockResolvedValueOnce(response(200, {
        success: true,
        idempotentReplay: false,
        membershipId: 'membership-1',
        uid: 'staff-1',
        role: 'viewer',
        status: 'active',
        requestId: 'staff-update',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        idempotentReplay: false,
        inviteId: 'invite-1',
        status: 'revoked',
        requestId: 'invite-revoke',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await api.adminStaffDirectory('fixture-tenant', 100);
    await api.updateStaffMembership({
      tenantId: 'fixture-tenant',
      membershipId: 'membership-1',
      role: 'viewer',
      status: 'active',
      auditReason: 'Change approved access.',
      idempotencyKey: 'staff-update:stable',
    });
    await api.revokeAdminInvite({
      tenantId: 'fixture-tenant',
      inviteId: 'invite-1',
      auditReason: 'Invitation is no longer required.',
      idempotencyKey: 'invite-revoke:stable',
    });
    expect(fetchMock.mock.calls[1][1].headers['Idempotency-Key']).toBe(
      'staff-update:stable',
    );
    expect(fetchMock.mock.calls[2][1].headers['Idempotency-Key']).toBe(
      'invite-revoke:stable',
    );
  });

  it('rejects inconsistent staff directory lifecycle state', async () => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () => response(200, {
        tenantId: 'fixture-tenant',
        staff: [{
          membershipId: 'membership-1',
          uid: 'staff-1',
          role: 'editor',
          status: 'inactive',
          active: true,
          emailVerified: true,
        }],
        pendingInvites: [],
        truncated: { staff: false, pendingInvites: false },
        requestId: 'invalid-staff-directory',
      }),
      getIdToken: async () => 'token',
    });
    await expect(
      api.adminStaffDirectory('fixture-tenant', 100),
    ).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: 'invalid-staff-directory',
    });
  });

  it('bootstraps onboarding with stable authorization retry and a strict tenant response', async () => {
    const result = {
      tenantId: 'fixture-athletics',
      programName: 'Fixture Athletics',
      readiness: {
        state: 'needs_action',
        launchReady: false,
        blockers: ['Connect a payment account before enabling payments.'],
        checks: { paymentAccount: false },
      },
      seeded: {
        teams: ['tigers'],
        primaryEvents: 0,
        pages: 4,
        contentBlocks: 8,
        domains: 0,
        brandingDoc: true,
        runtimeConfigDoc: true,
      },
      idempotentReplay: true,
      requestId: 'bootstrap-request',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(403, { error: 'refresh required' }))
      .mockResolvedValueOnce(response(200, result));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
      getAppCheckToken: async () => 'app-check-token',
    });
    const body = {
      tenantId: 'fixture-athletics',
      programName: 'Fixture Athletics',
      runtimeConfig: {
        teams: [{ teamId: 'tigers', name: 'Tigers' }],
      },
    };

    await expect(
      api.bootstrapOrganization(body, 'bootstrap:stable'),
    ).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('/admin/onboarding/bootstrap');
      expect(call[1].headers).toMatchObject({
        'Idempotency-Key': 'bootstrap:stable',
        'X-Idempotency-Key': 'bootstrap:stable',
        'X-Firebase-AppCheck': 'app-check-token',
      });
      expect(JSON.parse(call[1].body)).toEqual({
        ...body,
        operationKey: 'bootstrap:stable',
      });
    }
  });

  it('fails closed when onboarding success lacks readiness evidence', async () => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () => response(200, {
        tenantId: 'fixture-athletics',
        programName: 'Fixture Athletics',
        readiness: {
          state: 'ready',
          blockers: [],
          checks: {},
        },
        seeded: { teams: ['tigers'] },
        idempotentReplay: false,
        requestId: 'bootstrap-invalid-response',
      }),
      getIdToken: async () => 'token',
    });

    await expect(
      api.bootstrapOrganization(
        {
          tenantId: 'fixture-athletics',
          programName: 'Fixture Athletics',
        },
        'bootstrap:stable',
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: 'bootstrap-invalid-response',
    });
  });

  it.each([
    ['an empty body', ''],
    ['malformed JSON', '{not-json'],
    ['an array payload', '[]'],
    ['a primitive payload', '"ok"'],
    ['an empty object', '{}'],
  ])('rejects %s on a successful typed response', async (_label, body) => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () =>
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      getIdToken: async () => 'token',
    });

    await expect(api.billingHistory('fixture-tenant')).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
    });
  });

  it('rejects a successful mutation envelope that lacks operation evidence', async () => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () =>
        response(200, {
          success: true,
          id: 'team-1',
          idempotentReplay: false,
          requestId: 'request-without-operation',
        }),
      getIdToken: async () => 'token',
    });

    await expect(
      api.createTeam(
        'fixture-tenant',
        { name: 'Tigers', description: '', parentTeamId: null },
        'Create the approved team.',
        'team-create:stable',
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: 'request-without-operation',
    });
  });

  it('deletes a team through the audited CRM mutation contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      success: true,
      id: 'team-1',
      deleted: true,
      idempotentReplay: false,
      operationId: 'team-delete-operation',
      requestId: 'team-delete-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    await expect(
      api.deleteTeam(
        'fixture-tenant',
        'team-1',
        'Delete the obsolete team and archive linked content.',
        'team-delete:stable',
      ),
    ).resolves.toMatchObject({ id: 'team-1', deleted: true });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      tenantId: 'fixture-tenant',
      action: 'team.delete',
      resourceId: 'team-1',
      data: {},
      auditReason: 'Delete the obsolete team and archive linked content.',
      idempotencyKey: 'team-delete:stable',
    });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'Idempotency-Key': 'team-delete:stable',
      'X-Idempotency-Key': 'team-delete:stable',
    });
  });

  it('sends the exact event route contracts and validates their action evidence', async () => {
    const mutationBase = {
      success: true,
      idempotentReplay: false,
      operationId: 'event-operation',
      requestId: 'event-request',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(201, {
        ...mutationBase,
        id: 'series-1',
        eventIds: ['series-1'],
        publicationSyncStatus: 'not_required',
      }))
      .mockResolvedValueOnce(response(201, {
        ...mutationBase,
        id: 'series-1',
        eventIds: ['event-2'],
      }))
      .mockResolvedValueOnce(response(200, {
        ...mutationBase,
        id: 'series-1',
        eventIds: ['series-1'],
        updatedCount: 1,
        publicationSyncStatus: 'succeeded',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const occurrence = {
      dateKey: '2030-08-03',
      startTime: '16:00',
      endTime: '17:30',
      startAt: '2030-08-03T23:00:00.000Z',
      endAt: '2030-08-04T00:30:00.000Z',
      timeZone: 'America/Los_Angeles',
    };

    await api.createEventSeries(
      'fixture-tenant',
      {
        teamId: 'team-1',
        title: 'Opening practice',
        type: 'Practice',
        occurrences: [occurrence],
        location: 'Field One',
        notes: '',
        imageReservationId: null,
        seasonId: null,
        registrationFormId: null,
        publishMode: 'draft',
      },
      'Create the reviewed event draft.',
      'event-create:stable',
    );
    await api.duplicateEvent(
      'fixture-tenant',
      'series-1',
      [occurrence],
      'Add the reviewed date.',
      'event-duplicate:stable',
    );
    await api.updateEvent(
      'fixture-tenant',
      'series-1',
      { lifecycleStatus: 'published' },
      'Publish the reviewed event.',
      'event-update:stable',
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      action: 'event.create_series',
      data: {
        teamId: 'team-1',
        title: 'Opening practice',
        type: 'Practice',
        occurrences: [occurrence],
        location: 'Field One',
        notes: '',
        imageReservationId: null,
        seasonId: null,
        registrationFormId: null,
        publishMode: 'draft',
      },
      auditReason: 'Create the reviewed event draft.',
      idempotencyKey: 'event-create:stable',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      action: 'event.duplicate',
      resourceId: 'series-1',
      data: { occurrences: [occurrence] },
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({
      action: 'event.update',
      resourceId: 'series-1',
      data: { lifecycleStatus: 'published' },
    });
  });

  it.each([
    [
      'create without occurrence identifiers',
      (api: BackendApi) => api.createEventSeries(
        'fixture-tenant',
        {
          teamId: 'team-1',
          title: 'Practice',
          type: 'Practice',
          occurrences: [],
          location: '',
          notes: '',
          seasonId: null,
          registrationFormId: null,
          publishMode: 'draft',
        },
        'Create the draft.',
        'event-create:stable',
      ),
      {
        id: 'series-1',
        publicationSyncStatus: 'not_required',
      },
    ],
    [
      'duplicate without created identifiers',
      (api: BackendApi) => api.duplicateEvent(
        'fixture-tenant',
        'event-1',
        [],
        'Add the date.',
        'event-duplicate:stable',
      ),
      { id: 'series-1', eventIds: [] },
    ],
    [
      'update without an affected count',
      (api: BackendApi) => api.updateEvent(
        'fixture-tenant',
        'event-1',
        { title: 'Changed' },
        'Update the title.',
        'event-update:stable',
      ),
      {
        id: 'event-1',
        publicationSyncStatus: 'not_required',
      },
    ],
  ])('rejects event mutation success for %s', async (_label, request, evidence) => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () => response(200, {
        success: true,
        idempotentReplay: false,
        operationId: 'event-operation',
        requestId: 'event-invalid-response',
        ...evidence,
      }),
      getIdToken: async () => 'token',
    });

    await expect(request(api)).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: 'event-invalid-response',
    });
  });

  it.each([
    [
      'a wrong-tenant overview',
      (api: BackendApi) => api.financialOverview('fixture-tenant'),
      {
        tenantId: 'other-tenant',
        transactions: [],
        refunds: [],
        invoices: [],
        deposits: [],
        truncated: {
          transactions: false,
          refunds: false,
          invoices: false,
          deposits: false,
        },
        requestId: 'overview-wrong-tenant',
      },
    ],
    [
      'non-boolean overview truncation',
      (api: BackendApi) => api.financialOverview('fixture-tenant'),
      {
        tenantId: 'fixture-tenant',
        transactions: [],
        refunds: [],
        invoices: [],
        deposits: [],
        truncated: {
          transactions: 'no',
          refunds: false,
          invoices: false,
          deposits: false,
        },
        requestId: 'overview-invalid-truncation',
      },
    ],
    [
      'an incomplete direct-invoice record',
      (api: BackendApi) => api.directInvoicePage('fixture-tenant'),
      {
        tenantId: 'fixture-tenant',
        status: null,
        invoices: [{ id: 'invoice-1' }],
        truncated: false,
        hasMore: false,
        nextCursor: null,
        limit: 100,
        requestId: 'invoice-invalid-record',
      },
    ],
    [
      'a wrong-invoice ledger',
      (api: BackendApi) =>
        api.directInvoiceLedger('fixture-tenant', 'invoice-1'),
      {
        tenantId: 'fixture-tenant',
        invoice: { ...validDirectInvoice(), id: 'invoice-2' },
        events: [],
        payments: [],
        refunds: [],
        truncated: { events: false, payments: false, refunds: false },
        limits: { events: 500, payments: 100, refunds: 100 },
        requestId: 'ledger-wrong-invoice',
      },
    ],
    [
      'a provider ledger whose minor-unit equations do not reconcile',
      (api: BackendApi) => api.directInvoiceLedger('fixture-tenant', 'invoice-1'),
      {
        tenantId: 'fixture-tenant',
        invoice: validDirectInvoice(),
        events: [], payments: [], refunds: [],
        providerAccounting: {
          source: 'stripe_balance_transactions', currency: 'USD',
          chargeGrossCents: 123, chargeFeeCents: 34, chargeNetCents: 90,
          refundGrossCents: -1, refundFeeCents: 0, refundNetCents: -1,
          settledNetCents: 89,
        },
        truncated: { events: false, payments: false, refunds: false },
        limits: { events: 500, payments: 100, refunds: 100 },
        requestId: 'ledger-invalid-provider-accounting',
      },
    ],
  ])('fails closed for %s', async (_label, request, payload) => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () => response(200, payload),
      getIdToken: async () => 'token',
    });

    await expect(request(api)).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: payload.requestId,
    });
  });

  it('validates the audited export envelope and sends the exact selection with one key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        exportId: 'export-1',
        resourceId: 'invoices',
        rowCount: 1,
        visibleColumnIds: ['invoiceNumber'],
        checksum: 'a'.repeat(64),
        expiresAt: '2026-07-27T12:00:00.000Z',
        csvBase64: btoa('invoiceNumber\nHW-2026-0001\n'),
        idempotentReplay: false,
        requestId: 'export-request',
      }),
    );
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const exportRequest = {
      tenantId: 'fixture-tenant',
      resourceId: 'invoices',
      visibleColumnIds: ['invoiceNumber'],
      selection: { scope: 'explicit' as const, ids: ['invoice-1'] },
      filter: { op: 'and', children: [] },
      sort: [{ columnId: 'createdAt', direction: 'desc' }],
      locale: 'en-US',
      timeZone: 'UTC',
    };

    await expect(
      api.createCrmExport(exportRequest, 'export:stable'),
    ).resolves.toMatchObject({
      tenantId: 'fixture-tenant',
      exportId: 'export-1',
      rowCount: 1,
    });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'Idempotency-Key': 'export:stable',
      'X-Idempotency-Key': 'export:stable',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      exportRequest,
    );
  });

  it('rejects an export success for the wrong resource contract', async () => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () =>
        response(200, {
          tenantId: 'fixture-tenant',
          exportId: 'export-1',
          resourceId: 'registrations',
          rowCount: 1,
          visibleColumnIds: ['invoiceNumber'],
          checksum: 'a'.repeat(64),
          expiresAt: '2026-07-27T12:00:00.000Z',
          csvBase64: btoa('invoiceNumber\nHW-2026-0001\n'),
          idempotentReplay: false,
          requestId: 'export-wrong-resource',
        }),
      getIdToken: async () => 'token',
    });

    await expect(
      api.createCrmExport(
        {
          tenantId: 'fixture-tenant',
          resourceId: 'invoices',
          visibleColumnIds: ['invoiceNumber'],
          selection: { scope: 'explicit', ids: ['invoice-1'] },
          filter: {},
          sort: [],
          locale: 'en-US',
          timeZone: 'UTC',
        },
        'export:stable',
      ),
    ).rejects.toMatchObject({
      status: 502,
      code: 'invalid_backend_response',
      requestId: 'export-wrong-resource',
    });
  });

  it('loads and validates the tenant monthly email allowance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      success: true,
      tenantId: 'fixture-tenant',
      monthKey: '2026-08',
      resetsAt: '2026-09-01T00:00:00.000Z',
      monthlyLimit: 40000,
      usedCount: 425,
      sentCount: 420,
      localSentCount: 420,
      providerSentCount: 420,
      reservedCount: 5,
      remainingCount: 39575,
      capacityMode: 'normal',
      monthlyAllowanceVisible: true,
      providerReconciliationStatus: 'verified',
      providerReconciledAt: '2026-08-28T12:00:00.000Z',
      emailSendingStatus: 'enabled',
      emailSuspensionReason: null,
      bounceRate: 0.01,
      complaintRate: 0.0002,
      perSendLimit: 400,
      requestId: 'quota-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });

    const outreachApi = new RegistrationOutreachApi(api);
    await expect(outreachApi.emailQuota('fixture-tenant')).resolves.toMatchObject({
      monthlyLimit: 40000,
      remainingCount: 39575,
      perSendLimit: 400,
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/messages/email-quota?tenantId=fixture-tenant',
    );
  });

  it('loads, starts, and disconnects a connected admin mailbox without exposing credentials', async () => {
    const disconnected = {
      success: true,
      tenantId: 'fixture-tenant',
      connected: false,
      status: 'not_connected',
      provider: null,
      email: null,
      displayName: null,
      connectedAt: null,
      lastCheckedAt: null,
      availableProviders: ['google', 'microsoft'],
      requestId: 'mailbox-status-request',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, disconnected))
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed',
        requestId: 'mailbox-start-request',
      }))
      .mockResolvedValueOnce(response(200, {
        ...disconnected,
        requestId: 'mailbox-disconnect-request',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const outreachApi = new RegistrationOutreachApi(api);

    await expect(outreachApi.connectedMailbox('fixture-tenant')).resolves.toMatchObject({
      connected: false,
      availableProviders: ['google', 'microsoft'],
    });
    await expect(
      outreachApi.startMailboxConnection('fixture-tenant', 'google'),
    ).resolves.toMatchObject({ authorizationUrl: expect.stringMatching(/^https:\/\//) });
    await expect(outreachApi.disconnectMailbox('fixture-tenant')).resolves.toMatchObject({
      connected: false,
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/communications/connected-mailbox?tenantId=fixture-tenant',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      tenantId: 'fixture-tenant',
      provider: 'google',
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      tenantId: 'fixture-tenant',
    });
  });

  it('previews and sends direct email through the protected quota boundary', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, {
        tenantId: 'fixture-tenant',
        requestedCount: 2,
        uniqueRecipientCount: 2,
        inAppReadyCount: 1,
        retainedPendingActivationCount: 1,
        emailEligibleCount: 2,
        emailSuppressedCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        publicMessageCount: 0,
        excludedCount: 0,
        chunkSize: 2,
        chunkCount: 1,
        emailRecipientLimit: 400,
        tenantEmailRemaining: 39575,
        tenantEmailMonthlyLimit: 40000,
        tenantEmailMonthKey: '2026-08',
        tenantEmailResetsAt: '2026-09-01T00:00:00.000Z',
        platformEmailRemaining: 9000,
        capacityMode: 'normal',
        monthlyAllowanceVisible: true,
        requestId: 'preview-request',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        communicationId: 'communication-1',
        audienceMode: 'direct',
        recipientCount: 2,
        sentCount: 2,
        sentRecipients: ['family@example.com', 'second@example.com'],
        failedCount: 0,
        failures: [],
        suppressedCount: 0,
        requestId: 'send-request',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const recipientEmails = ['family@example.com', 'second@example.com'];

    const outreachApi = new RegistrationOutreachApi(api);
    await expect(outreachApi.messageAudiencePreview({
      tenantId: 'fixture-tenant',
      emails: recipientEmails,
    })).resolves.toMatchObject({
      emailEligibleCount: 2,
      tenantEmailRemaining: 39575,
    });
    await expect(outreachApi.sendOneWayEmail({
      tenantId: 'fixture-tenant',
      recipientEmails,
      subject: 'Practice update',
      message: 'Practice starts at six.',
      idempotencyKey: 'email-send:stable',
    })).resolves.toMatchObject({ sentCount: 2 });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/messages/audience-preview',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      emails: recipientEmails,
      emailRequested: true,
    });
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://api.example.test/communications/one-way-email',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      deliveryMode: 'huddleway',
      audience: { mode: 'direct', emails: recipientEmails },
      channels: { push: false },
      communication: {
        type: 'update',
        subject: 'Practice update',
        message: 'Practice starts at six.',
      },
    });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      'Idempotency-Key': 'email-send:stable',
      'X-Idempotency-Key': 'email-send:stable',
    });
  });

  it('creates a scoped registration link and sends it through the protected email route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(201, {
        linkId: 'registration_link_1',
        tenantId: 'fixture-tenant',
        targetType: 'event',
        targetId: 'event-1',
        eventId: 'event-1',
        displayTitle: 'Fall Tryouts',
        registrationKind: 'paid',
        priceCents: 2500,
        currency: 'USD',
        recipientCount: 1,
        url: 'https://app.example.test/register?token=opaque',
        expiresAt: '2026-08-27T20:00:00.000Z',
        idempotentReplay: false,
        requestId: 'link-request',
      }))
      .mockResolvedValueOnce(response(200, {
        success: true,
        tenantId: 'fixture-tenant',
        communicationId: 'communication-1',
        audienceMode: 'direct',
        recipientCount: 1,
        sentCount: 1,
        sentRecipients: ['family@example.com'],
        failedCount: 0,
        failures: [],
        suppressedCount: 0,
        requestId: 'email-request',
      }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'token',
    });
    const outreachApi = new RegistrationOutreachApi(api);

    const invite = await outreachApi.createInvite({
      tenantId: 'fixture-tenant',
      targetType: 'event',
      targetId: 'event-1',
      eventId: 'event-1',
      recipientEmails: ['family@example.com'],
      idempotencyKey: 'registration-link:stable',
    });
    await expect(outreachApi.sendEmail({
      tenantId: 'fixture-tenant',
      recipientEmails: ['family@example.com'],
      subject: 'Register now',
      message: 'Tryouts are open.',
      eventTitle: invite.displayTitle,
      registrationUrl: invite.url,
      registrationLabel: 'Register and pay',
      amountCents: invite.priceCents,
      currency: invite.currency,
      idempotencyKey: 'registration-email:stable',
    })).resolves.toMatchObject({ sentCount: 1 });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/admin/registration-links',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      targetType: 'event',
      targetId: 'event-1',
      eventId: 'event-1',
      recipientEmails: ['family@example.com'],
      operationKey: 'registration-link:stable',
    });
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://api.example.test/communications/one-way-email',
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      tenantId: 'fixture-tenant',
      audience: { mode: 'direct', emails: ['family@example.com'] },
      communication: {
        registrationUrl: 'https://app.example.test/register?token=opaque',
        registrationLabel: 'Register and pay',
        amountCents: 2500,
      },
    });
  });

  it('returns safe status, code, and request correlation on failure', async () => {
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: async () =>
        response(
          409,
          {
            error: 'Invoice is already paid.',
            code: 'invalid_invoice_transition',
          },
          { 'x-request-id': 'server-request-9' },
        ),
      getIdToken: async () => 'token',
    });

    const expectedError = {
      status: 409,
      code: 'invalid_invoice_transition',
      requestId: 'server-request-9',
      message: 'Invoice is already paid.',
    } satisfies Partial<BackendApiError>;

    await expect(api.directInvoiceAction(
      'fixture-tenant',
      'invoice-1',
      'void',
    )).rejects.toMatchObject(expectedError);
  });

  it('resumes Stripe Connect through the credentialed protected handoff', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      onboardingUrl: 'https://connect.stripe.example/onboarding',
      requestId: 'stripe-refresh-request',
    }));
    const api = new BackendApi({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      getIdToken: async () => 'owner-token',
      getAppCheckToken: async () => 'app-check-token',
      requireAppCheck: true,
    });

    await expect(api.stripeConnectRefresh('opaque-stage-handoff')).resolves.toMatchObject({
      onboardingUrl: 'https://connect.stripe.example/onboarding',
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/stripe/connect/refresh',
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({
        Authorization: 'Bearer owner-token',
        'X-Firebase-AppCheck': 'app-check-token',
      }),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      handoff: 'opaque-stage-handoff',
    });
  });
});
