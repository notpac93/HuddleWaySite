import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createRegistrationInviteLink: vi.fn(),
  adminInboxThreads: vi.fn(),
  emailQuota: vi.fn(),
  connectedMailbox: vi.fn(),
  startMailboxConnection: vi.fn(),
  disconnectMailbox: vi.fn(),
  messageAudiencePreview: vi.fn(),
  announcementAudiencePreview: vi.fn(),
  replyAdminInbox: vi.fn(),
  getDocs: vi.fn(),
  recallMessage: vi.fn(),
  sendRegistrationEmail: vi.fn(),
  sendOneWayEmail: vi.fn(),
  sendMessageBatch: vi.fn(),
  updateAnnouncement: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({ kind: 'collection', args })),
  getDocs: mocks.getDocs,
  limit: vi.fn((value: number) => ({ kind: 'limit', value })),
  orderBy: vi.fn((field: string, direction: string) => ({
    kind: 'orderBy',
    field,
    direction,
  })),
  query: vi.fn((...args: unknown[]) => ({ kind: 'query', args })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    kind: 'where',
    field,
    operator,
    value,
  })),
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    adminInboxThreads: mocks.adminInboxThreads,
    replyAdminInbox: mocks.replyAdminInbox,
    recallMessage: mocks.recallMessage,
    announcementAudiencePreview: mocks.announcementAudiencePreview,
    sendMessageBatch: mocks.sendMessageBatch,
    updateAnnouncement: mocks.updateAnnouncement,
  },
}));

vi.mock('../../src/lib/api/RegistrationOutreachApi', () => ({
  registrationOutreachApi: {
    createInvite: mocks.createRegistrationInviteLink,
    emailQuota: mocks.emailQuota,
    connectedMailbox: mocks.connectedMailbox,
    startMailboxConnection: mocks.startMailboxConnection,
    disconnectMailbox: mocks.disconnectMailbox,
    messageAudiencePreview: mocks.messageAudiencePreview,
    sendEmail: mocks.sendRegistrationEmail,
    sendOneWayEmail: mocks.sendOneWayEmail,
  },
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    eventsStore: writable([
      {
        id: 'event-1',
        title: 'Summer Showcase',
        teamId: 'varsity',
        seasonId: 'season-1',
        imageUrl: 'https://example.com/showcase.webp',
        importance: 'featured',
        accentColorHex: '#2457d6',
      },
    ]),
    seasonsStore: writable([
      {
        id: 'season-1',
        name: 'Summer 2026',
        teamId: 'varsity',
        imageUrl: 'https://example.com/summer.webp',
      },
    ]),
    registrationsStore: writable([]),
    teamsStore: writable([
      { id: 'varsity', name: 'Varsity', accentColorHex: '#2457d6' },
    ]),
  };
});

import { tenantIdStore } from '../../src/lib/authStore';
import { backendClient } from '../../src/lib/api/backendClient';
import { registrationOutreachApi } from '../../src/lib/api/RegistrationOutreachApi';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import CommunicationsManager from '../../src/components/crm/CommunicationsManager.svelte';

const TestedCommunicationsManager =
  CommunicationsManager as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function messageSnapshot() {
  return {
    docs: [{
      id: 'message-1',
      data: () => ({
        authorName: 'Program Director',
        subject: 'Practice update',
        body: 'Practice starts at six.',
        teamId: 'program',
        isDeleted: false,
        createdAt: {
          toDate: () => new Date('2026-07-26T18:00:00.000Z'),
        },
      }),
    }],
  };
}

function emptySnapshot() {
  return { docs: [] };
}

function notificationSummary(overrides: Record<string, unknown> = {}) {
  return {
    scope: 'tenant_account_holders',
    topic: null,
    requestedMessageCount: 1,
    sentMessageCount: 1,
    failedMessageCount: 0,
    noRecipientMessageCount: 0,
    replayedMessageCount: 0,
    eligibleAccountCount: 2,
    eligibleDeviceCount: 2,
    successCount: 2,
    failureCount: 0,
    providerErrorCodes: {},
    ...overrides,
  };
}

function quotaSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    tenantId: 'tenant-a',
    monthKey: '2026-08',
    resetsAt: '2026-09-01T00:00:00.000Z',
    monthlyLimit: 40000,
    usedCount: 425,
    sentCount: 425,
    localSentCount: 425,
    providerSentCount: 425,
    reservedCount: 0,
    remainingCount: 39575,
    capacityMode: 'normal',
    monthlyAllowanceVisible: true,
    providerReconciliationStatus: 'verified',
    providerReconciledAt: '2026-08-28T12:00:00.000Z',
    emailSendingStatus: 'enabled',
    emailSuspensionReason: null,
    bounceRate: 0,
    complaintRate: 0,
    perSendLimit: 400,
    requestId: 'quota-request',
    ...overrides,
  };
}

function audiencePreview(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-a',
    requestedCount: 2,
    uniqueRecipientCount: 2,
    inAppReadyCount: 0,
    retainedPendingActivationCount: 2,
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
    ...overrides,
  };
}

function announcementAudiencePreview(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    tenantId: 'tenant-a',
    scope: 'tenant_account_holders',
    eligibleAccountCount: 12,
    eligibleDeviceCount: 9,
    truncated: false,
    requestId: 'announcement-preview-request',
    ...overrides,
  };
}

async function confirmAnnouncementReview() {
  const review = await screen.findByRole('dialog', {
    name: 'Review app announcement',
  });
  await fireEvent.click(within(review).getByRole('checkbox'));
  await fireEvent.click(within(review).getByRole('button', {
    name: 'Confirm and publish',
  }));
}

describe('CommunicationsManager recall boundary', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    mocks.getDocs.mockReset();
    mocks.adminInboxThreads.mockReset();
    mocks.adminInboxThreads.mockResolvedValue({
      success: true,
      tenantId: 'tenant-a',
      threads: [],
      truncated: false,
      requestId: 'inbox-request',
    });
    mocks.emailQuota.mockReset();
    mocks.emailQuota.mockResolvedValue(quotaSnapshot());
    mocks.connectedMailbox.mockReset();
    mocks.connectedMailbox.mockResolvedValue({
      success: true,
      tenantId: 'tenant-a',
      connected: false,
      status: 'not_connected',
      provider: null,
      email: null,
      displayName: null,
      connectedAt: null,
      lastCheckedAt: null,
      availableProviders: ['google', 'microsoft'],
      requestId: 'mailbox-request',
    });
    mocks.startMailboxConnection.mockReset();
    mocks.disconnectMailbox.mockReset();
    mocks.messageAudiencePreview.mockReset();
    mocks.messageAudiencePreview.mockResolvedValue(audiencePreview());
    mocks.announcementAudiencePreview.mockReset();
    mocks.announcementAudiencePreview.mockResolvedValue(
      announcementAudiencePreview(),
    );
    mocks.replyAdminInbox.mockReset();
    mocks.createRegistrationInviteLink.mockReset();
    mocks.recallMessage.mockReset();
    mocks.sendRegistrationEmail.mockReset();
    mocks.sendOneWayEmail.mockReset();
    mocks.sendMessageBatch.mockReset();
    mocks.updateAnnouncement.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('expands an announcement into its details view', async () => {
    mocks.getDocs.mockResolvedValueOnce(messageSnapshot());
    render(TestedCommunicationsManager);

    const announcement = await screen.findByRole('button', {
      name: /Practice update/,
    });
    expect(announcement).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Sent to')).toBeNull();

    await fireEvent.click(announcement);

    expect(announcement).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Sent to')).toBeVisible();
    expect(screen.getByText('All organization account holders')).toBeVisible();
    expect(screen.queryByText('Published by')).toBeNull();
    expect(screen.queryByText('Published')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Duplicate as new' })).toBeNull();
    expect(screen.getAllByText('Practice starts at six.')).toHaveLength(1);
    expect(within(screen.getByRole('group', { name: 'Filter announcements by association' })).getByRole('button', { name: 'Teams' })).toBeInTheDocument();
  });

  it('edits a previously published announcement without creating or pushing a new post', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(messageSnapshot())
      .mockResolvedValueOnce(messageSnapshot());
    mocks.updateAnnouncement.mockResolvedValueOnce({
      success: true,
      idempotentReplay: false,
      messageId: 'message-1',
      requestId: 'edit-request',
    });
    render(TestedCommunicationsManager);

    await fireEvent.click(await screen.findByRole('button', { name: /Practice update/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Edit announcement' }));
    expect(screen.getByRole('heading', { name: 'Edit announcement' })).toBeVisible();
    expect(screen.getByText('Changes update this existing announcement. No new push notification is sent.')).toBeVisible();
    const announcementHistory = screen.getByRole('region', { name: 'Published announcements' });
    expect(within(announcementHistory).queryByLabelText('Since')).toBeNull();
    const associationFilters = screen.getByRole('group', { name: 'Filter announcements by association' });
    await fireEvent.click(screen.getByRole('button', { name: 'Search announcements' }));
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search announcements by keyword' }), {
      target: { value: 'hidden by an old search' },
    });
    await fireEvent.click(within(associationFilters).getByRole('button', { name: 'Events' }));
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Practice now starts at seven.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(backendClient.updateAnnouncement).toHaveBeenCalledTimes(1));
    expect(mocks.updateAnnouncement).toHaveBeenCalledWith(
      'tenant-a',
      'message-1',
      expect.objectContaining({
        id: 'message-1',
        subject: 'Practice update',
        body: 'Practice now starts at seven.',
      }),
      expect.stringMatching(/^message-batch:/),
    );
    expect(backendClient.announcementAudiencePreview).not.toHaveBeenCalled();
    expect(backendClient.sendMessageBatch).not.toHaveBeenCalled();
    expect(await screen.findByText('Announcement updated in Published announcements below. Edits do not send another push notification.')).toBeVisible();
    expect(screen.queryByRole('searchbox', { name: 'Search announcements by keyword' })).toBeNull();
    expect(within(associationFilters).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Sent to')).toBeVisible();
  });

  it('discards a cancelled announcement draft so it does not return after reload', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);
    await fireEvent.click(await screen.findByRole('button', { name: 'New announcement' }));
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Discard this draft.' },
    });
    expect(window.sessionStorage.getItem('huddleway-message-draft:tenant-a')).toContain('Discard this draft.');
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.sessionStorage.getItem('huddleway-message-draft:tenant-a')).toBeNull();
  });

  it('deletes an announcement and refreshes the visible message', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(messageSnapshot())
      .mockResolvedValueOnce(emptySnapshot());
    let resolveRecall:
      | ((value: Awaited<ReturnType<typeof backendClient.recallMessage>>) => void)
      | undefined;
    mocks.recallMessage.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveRecall = resolve;
      }),
    );
    render(TestedCommunicationsManager);

    expect(await screen.findByText('Practice update')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Delete announcement?',
    });
    const submit = screen.getByRole('button', {
      name: 'Delete announcement',
    });
    expect(submit).toBeDisabled();
    await fireEvent.input(within(dialog).getByLabelText('Audit reason'), { target: { value: 'Duplicate announcement' } });
    expect(submit).toBeEnabled();
    await fireEvent.click(submit);
    await fireEvent.click(submit);

    expect(backendClient.recallMessage).toHaveBeenCalledTimes(1);
    const [tenantId, messageId, operationKey, auditReason] =
      vi.mocked(backendClient.recallMessage).mock.calls[0];
    expect(tenantId).toBe('tenant-a');
    expect(messageId).toBe('message-1');
    expect(operationKey).toMatch(/^message-recall-message-1:/);
    expect(auditReason).toBe('Duplicate announcement');
    expect(
      within(dialog).getByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Close delete confirmation' }),
    ).toBeDisabled();

    resolveRecall?.({
      success: true,
      idempotentReplay: false,
      messageId: 'message-1',
      requestId: 'recall-request',
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('Practice update')).not.toBeInTheDocument();
      expect(screen.getByText('Announcement deleted.')).toBeVisible();
    });
  });

  it('keeps the same key for a correlated retry', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(messageSnapshot())
      .mockResolvedValueOnce(emptySnapshot());
    mocks.recallMessage
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'raw backend detail',
          status: 503,
          code: 'message_recall_failed',
          requestId: 'safe-recall-request',
        }),
      )
      .mockResolvedValueOnce({
        success: true,
        idempotentReplay: true,
        messageId: 'message-1',
        requestId: 'replay-request',
      });
    render(TestedCommunicationsManager);
    expect(await screen.findByText('Practice update')).toBeVisible();

    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await fireEvent.input(screen.getByLabelText('Audit reason'), { target: { value: 'Superseded content' } });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Delete announcement' }),
    );
    expect(
      await screen.findByText('The announcement could not be deleted.'),
    ).toBeVisible();
    expect(screen.queryByText(/safe-recall-request/i)).not.toBeInTheDocument();
    expect(screen.queryByText('raw backend detail')).not.toBeInTheDocument();
    const firstCall = vi.mocked(backendClient.recallMessage).mock.calls[0];

    await fireEvent.click(
      screen.getByRole('button', { name: 'Delete announcement' }),
    );
    await waitFor(() => {
      expect(backendClient.recallMessage).toHaveBeenCalledTimes(2);
    });
    const secondCall = vi.mocked(backendClient.recallMessage).mock.calls[1];
    expect(secondCall[2]).toBe(firstCall[2]);
  });

  it('publishes a valid organization announcement through the backend', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(emptySnapshot())
      .mockResolvedValueOnce(emptySnapshot());
    mocks.sendMessageBatch.mockResolvedValueOnce({
      success: true,
      sendId: 'send-1',
      messageCount: 1,
      activeRecipientCount: 0,
      retainedRecipientCount: 0,
      publicCount: 1,
      notifications: notificationSummary(),
      requestId: 'publish-request',
    });
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');

    await fireEvent.click(
      screen.getByRole('button', { name: 'New announcement' }),
    );
    expect(screen.getByText('Only this organization’s account holders receive this announcement and notification.')).toBeVisible();
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'A valid announcement body.' },
    });
    const publishButton = screen.getByRole('button', {
      name: 'Review announcement',
    });
    expect(publishButton).toBeEnabled();

    await fireEvent.click(publishButton);

    const review = await screen.findByRole('dialog', {
      name: 'Review app announcement',
    });
    expect(backendClient.announcementAudiencePreview).toHaveBeenCalledWith(
      'tenant-a',
    );
    expect(within(review).getByText('12 eligible accounts')).toBeVisible();
    expect(within(review).getByText('Up to 9 active devices')).toBeVisible();
    expect(backendClient.sendMessageBatch).not.toHaveBeenCalled();
    await fireEvent.click(within(review).getByRole('checkbox'));
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Confirm and publish',
    }));

    await waitFor(() => {
      expect(backendClient.sendMessageBatch).toHaveBeenCalledTimes(1);
    });
    const [tenantId, messages, idempotencyKey] =
      vi.mocked(backendClient.sendMessageBatch).mock.calls[0];
    expect(tenantId).toBe('tenant-a');
    expect(idempotencyKey).toMatch(/^message-batch:/);
    expect(messages).toEqual([
      expect.objectContaining({
        tenantId: 'tenant-a',
        teamId: 'program',
        body: 'A valid announcement body.',
        isSecret: false,
        attachmentScope: 'all',
        eventId: null,
        seasonId: null,
      }),
    ]);
    expect(await screen.findByText('Announcement published and notification sent to 2 registered devices.')).toBeVisible();
  });

  it('shows the monthly allowance and sends a reviewed one-off or bulk email', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.sendOneWayEmail.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-a',
      communicationId: 'communication-bulk-1',
      audienceMode: 'direct',
      recipientCount: 2,
      sentCount: 2,
      sentRecipients: ['family@example.com', 'second@example.com'],
      failedCount: 0,
      failures: [],
      suppressedCount: 0,
      requestId: 'bulk-email-request',
    });
    render(TestedCommunicationsManager);

    expect(await screen.findByText(
      '39,575 of 40,000 emails left this month',
    )).toBeVisible();
    expect(screen.getByText(/Email usage checked/)).toBeVisible();
    expect(screen.queryByText(/Amazon SES|Resend|provider fallback/i)).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'New email' }));
    await fireEvent.input(screen.getByLabelText('Recipient emails'), {
      target: {
        value: 'Family@example.com\nfamily@example.com\nsecond@example.com',
      },
    });
    await fireEvent.input(screen.getByLabelText('Subject'), {
      target: { value: 'Practice update' },
    });
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Practice starts at six.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));

    const review = await screen.findByRole('dialog', {
      name: 'Review email send',
    });
    expect(within(review).getByText('39,575 of 40,000 left')).toBeVisible();
    expect(within(review).getByText('39,573 left')).toBeVisible();
    expect(registrationOutreachApi.sendOneWayEmail).not.toHaveBeenCalled();
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Send 2 emails',
    }));

    await waitFor(() => {
      expect(registrationOutreachApi.sendOneWayEmail).toHaveBeenCalledTimes(1);
    });
    expect(mocks.sendOneWayEmail).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      recipientEmails: ['family@example.com', 'second@example.com'],
      subject: 'Practice update',
      message: 'Practice starts at six.',
      deliveryMode: 'huddleway',
      idempotencyKey: expect.stringMatching(/^message-batch:/),
    });
    expect(await screen.findByText('2 emails sent.')).toBeVisible();
    expect(screen.queryByText(/Amazon SES|Resend|backup/i)).not.toBeInTheDocument();
    expect(mocks.emailQuota).toHaveBeenCalledTimes(3);
  });

  it('shows a provider-neutral error and retains failed addresses when delivery fails', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.messageAudiencePreview.mockResolvedValueOnce(audiencePreview({
      requestedCount: 1,
      uniqueRecipientCount: 1,
      retainedPendingActivationCount: 1,
      emailEligibleCount: 1,
      chunkSize: 1,
      tenantEmailRemaining: 39575,
    }));
    mocks.sendOneWayEmail.mockResolvedValueOnce({
      success: false,
      tenantId: 'tenant-a',
      communicationId: 'communication-failed-1',
      audienceMode: 'direct',
      recipientCount: 1,
      sentCount: 0,
      sentRecipients: [],
      failedCount: 1,
      failures: [{
        email: 'family@example.com',
        error: 'The email could not be delivered.',
      }],
      suppressedCount: 0,
      requestId: 'failed-email-request',
    });
    render(TestedCommunicationsManager);

    await fireEvent.click(await screen.findByRole('button', { name: 'New email' }));
    await fireEvent.input(screen.getByLabelText('Recipient emails'), {
      target: { value: 'family@example.com' },
    });
    await fireEvent.input(screen.getByLabelText('Subject'), {
      target: { value: 'Practice update' },
    });
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Practice starts at six.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    await fireEvent.click(within(await screen.findByRole('dialog', {
      name: 'Review email send',
    })).getByRole('button', { name: 'Send 1 email' }));

    expect(await screen.findByText(
      '0 emails sent; 1 failed. Only failed addresses remain in the form.',
    )).toBeVisible();
    expect(screen.queryByText(/failed-email-request/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Recipient emails')).toHaveValue('family@example.com');
    expect(screen.queryByText(/Amazon SES|Resend|backup|provider/i)).not.toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Review email again' });
    expect(retryButton).toBeEnabled();
    await fireEvent.click(retryButton);
    expect(await screen.findByRole('dialog', { name: 'Review email send' })).toBeVisible();
  });

  it('offers a connected mailbox at review for 100 or fewer recipients', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.messageAudiencePreview.mockResolvedValueOnce(audiencePreview({
      requestedCount: 1,
      uniqueRecipientCount: 1,
      retainedPendingActivationCount: 1,
      emailEligibleCount: 1,
      chunkSize: 1,
    }));
    mocks.connectedMailbox.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-a',
      connected: true,
      status: 'connected',
      provider: 'google',
      email: 'owner@gmail.com',
      displayName: 'Owner',
      connectedAt: null,
      lastCheckedAt: null,
      availableProviders: ['google', 'microsoft'],
      requestId: 'mailbox-connected',
    });
    mocks.sendOneWayEmail.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-a',
      communicationId: 'communication-personal-1',
      audienceMode: 'direct',
      deliveryMode: 'connected_mailbox',
      recipientCount: 1,
      sentCount: 1,
      sentRecipients: ['family@example.com'],
      failedCount: 0,
      failures: [],
      suppressedCount: 0,
      requestId: 'personal-send',
    });
    render(TestedCommunicationsManager);
    await fireEvent.click(await screen.findByRole('button', { name: 'New email' }));
    await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: 'family@example.com' } });
    await fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Practice' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Starts at six.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    const review = await screen.findByRole('dialog', { name: 'Review email send' });
    await fireEvent.click(within(review).getByRole('radio', { name: /My email · owner@gmail.com/ }));
    expect(within(review).getByText('Up to 100 recipients for this message.')).toBeVisible();
    expect(within(review).getByText(/Personal sends do not use the HuddleWay allowance/)).toBeVisible();
    expect(within(review).queryByText('39,575 of 40,000 left')).not.toBeInTheDocument();
    await fireEvent.click(within(review).getByRole('button', { name: 'Send 1 email' }));
    await waitFor(() => expect(mocks.sendOneWayEmail).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryMode: 'connected_mailbox' }),
    ));
  });

  it('shows the connected address and lets the current admin disconnect it', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.connectedMailbox.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-a',
      connected: true,
      status: 'connected',
      provider: 'microsoft',
      email: 'owner@outlook.com',
      displayName: 'Owner',
      connectedAt: null,
      lastCheckedAt: null,
      availableProviders: ['google', 'microsoft'],
      requestId: 'mailbox-connected',
    });
    mocks.disconnectMailbox.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-a',
      connected: false,
      status: 'not_connected',
      provider: null,
      email: null,
      displayName: null,
      connectedAt: null,
      lastCheckedAt: null,
      availableProviders: ['google', 'microsoft'],
      requestId: 'mailbox-disconnected',
    });
    render(TestedCommunicationsManager);

    await fireEvent.click(await screen.findByRole('button', { name: 'Email connection' }));
    expect(await screen.findByText('Connected: owner@outlook.com')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(mocks.disconnectMailbox).toHaveBeenCalledWith('tenant-a'));
    expect(await screen.findByRole('button', { name: 'Connect Google or Gmail' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Connect Microsoft or Outlook' })).toBeEnabled();
  });

  it('shows HuddleWay as mandatory when the final audience exceeds 100', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    const emails = Array.from({ length: 101 }, (_, index) => `family${index}@example.com`);
    mocks.messageAudiencePreview.mockResolvedValueOnce(audiencePreview({
      requestedCount: 101,
      uniqueRecipientCount: 101,
      retainedPendingActivationCount: 101,
      emailEligibleCount: 101,
      chunkSize: 101,
    }));
    render(TestedCommunicationsManager);
    await fireEvent.click(await screen.findByRole('button', { name: 'New email' }));
    await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: emails.join('\n') } });
    await fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Schedule' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Season schedule.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    const review = await screen.findByRole('dialog', { name: 'Review email send' });
    expect(within(review).getByText('101 recipients · HuddleWay delivery')).toBeVisible();
    expect(within(review).queryByRole('radio', { name: /My email/ })).not.toBeInTheDocument();
  });

  it('clearly explains why an invalid recipient blocks review', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);

    await fireEvent.click(await screen.findByRole('button', { name: 'New email' }));
    const recipients = screen.getByLabelText('Recipient emails');
    await fireEvent.input(recipients, {
      target: { value: 'family@example.com\nnot-an-email' },
    });
    await fireEvent.input(screen.getByLabelText('Subject'), {
      target: { value: 'Practice update' },
    });
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Practice starts at six.' },
    });

    expect(recipients).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(
      /1\/\d+ unique valid addresses · Remove 1 invalid entry to continue/,
    );
    expect(screen.getByRole('button', { name: 'Review email' })).toBeDisabled();
  });

  it('keeps email sending available when Wall announcements fail to load', async () => {
    mocks.getDocs.mockRejectedValueOnce(new Error('missing index'));
    render(TestedCommunicationsManager);

    expect(await screen.findByText(
      'Wall announcements could not be loaded. Check your connection and try again.',
    )).toBeVisible();
    expect(screen.getByRole('button', { name: 'New email' })).toBeEnabled();
    expect(screen.getByLabelText('Email allowance')).toHaveTextContent(
      '39,575 of 40,000 emails left this month',
    );
  });

  it('hides the monthly count and shows a neutral temporary 100-recipient limit', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.emailQuota.mockResolvedValueOnce(quotaSnapshot({
      capacityMode: 'temporary_limited',
      monthlyAllowanceVisible: false,
      perSendLimit: 100,
    }));
    mocks.messageAudiencePreview.mockResolvedValueOnce(audiencePreview({
      emailRecipientLimit: 100,
      capacityMode: 'temporary_limited',
      monthlyAllowanceVisible: false,
    }));
    render(TestedCommunicationsManager);

    const allowance = await screen.findByLabelText('Email allowance');
    expect(allowance).toHaveTextContent('Temporary sending limit');
    expect(allowance).toHaveTextContent('Up to 100 recipients per email are available. Larger sends will return automatically.');
    expect(allowance).not.toHaveTextContent('39,575');
    expect(allowance).not.toHaveTextContent('40,000');
    expect(allowance).toHaveTextContent('HuddleWay sender ready');
    expect(allowance).not.toHaveTextContent('demo@huddleway.com');
    expect(allowance).not.toHaveTextContent(/AWS|SES|Resend|fallback|backup/i);
    await fireEvent.click(screen.getByRole('button', { name: 'Email connection' }));
    expect(screen.getByRole('heading', { name: 'Connect your email' })).toBeVisible();
    expect(screen.queryByText(/AWS|Resend|fallback|backup/i)).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'New email' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'New email' }));
    await fireEvent.input(screen.getByLabelText('Recipient emails'), {
      target: { value: 'family@example.com' },
    });
    await fireEvent.input(screen.getByLabelText('Subject'), {
      target: { value: 'Temporary capacity' },
    });
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'This remains available.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    const review = await screen.findByRole('dialog', { name: 'Review email send' });
    expect(review).toHaveTextContent('Up to 100 recipients per email are available right now.');
    expect(review).not.toHaveTextContent('39,575');
    expect(review).not.toHaveTextContent('40,000');
  });

  it('disables email actions with a neutral message when delivery is unavailable', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.emailQuota.mockResolvedValueOnce(quotaSnapshot({
      capacityMode: 'unavailable',
      monthlyAllowanceVisible: false,
      perSendLimit: 0,
    }));
    render(TestedCommunicationsManager);

    const allowance = await screen.findByLabelText('Email allowance');
    expect(allowance).toHaveTextContent('Email sending is temporarily unavailable');
    expect(allowance).not.toHaveTextContent(/AWS|SES|Resend|fallback|backup/i);
    expect(screen.getByRole('button', { name: 'New email' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start registration email' })).toBeDisabled();
  });

  it('makes a tenant reputation pause clear and blocks every email composer', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.emailQuota.mockResolvedValueOnce(quotaSnapshot({
      emailSendingStatus: 'suspended',
      emailSuspensionReason: 'complaint_rate_threshold',
      bounceRate: 0.01,
      complaintRate: 0.001,
    }));
    render(TestedCommunicationsManager);

    expect(await screen.findByText('Email sending is paused for this organization')).toBeVisible();
    expect(screen.getByText(/Email is paused after high bounce or complaint rates. Review is required./)).toBeVisible();
    expect(screen.queryByText(/Amazon SES|Resend|provider fallback/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New email' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start registration email' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Email connection' })).toBeEnabled();
  });

  it('does not send when the audience preview reports the monthly limit', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.messageAudiencePreview.mockRejectedValueOnce(new BackendApiError({
      message: 'This send has 2 eligible email recipients, but only 1 remains available right now.',
      status: 429,
      code: 'email_quota_preview_exceeded',
      requestId: 'quota-preview-block',
    }));
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');
    await fireEvent.click(screen.getByRole('button', { name: 'New email' }));
    await fireEvent.input(screen.getByLabelText('Recipient emails'), {
      target: { value: 'one@example.com\ntwo@example.com' },
    });
    await fireEvent.input(screen.getByLabelText('Subject'), {
      target: { value: 'Limit check' },
    });
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'This send should be reviewed first.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));

    expect(await screen.findByText(
      'This send has 2 eligible email recipients, but only 1 remains available right now.',
    )).toBeVisible();
    expect(screen.queryByText(/quota-preview-block/i)).not.toBeInTheDocument();
    expect(registrationOutreachApi.sendOneWayEmail).not.toHaveBeenCalled();
  });

  it('emails a temporary event registration page to deduped recipients', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.createRegistrationInviteLink.mockResolvedValueOnce({
      linkId: 'registration-link-1',
      tenantId: 'tenant-a',
      targetType: 'event',
      targetId: 'event-1',
      eventId: 'event-1',
      displayTitle: 'Summer Showcase',
      registrationKind: 'free',
      priceCents: 0,
      currency: 'USD',
      recipientCount: 2,
      url: 'https://app.example.test/register?token=opaque',
      expiresAt: '2026-08-27T20:00:00.000Z',
      idempotentReplay: false,
      requestId: 'link-request',
    });
    mocks.sendRegistrationEmail.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-a',
      communicationId: 'communication-1',
      audienceMode: 'direct',
      recipientCount: 2,
      sentCount: 2,
      sentRecipients: ['family@example.com', 'second@example.com'],
      failedCount: 0,
      failures: [],
      suppressedCount: 0,
      requestId: 'email-request',
    });
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Start registration email' }),
    );
    expect(screen.getByText(/temporary registration link using the same registration form and payment settings as the app/)).toBeVisible();
    await fireEvent.change(screen.getByLabelText('Event'), {
      target: { value: 'event-1' },
    });
    await fireEvent.input(screen.getByLabelText('Recipient emails'), {
      target: {
        value: 'Family@example.com\nfamily@example.com\nsecond@example.com',
      },
    });
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Registration is open.' },
    });
    const sendButton = screen.getByRole('button', {
      name: 'Review registration email',
    });
    expect(sendButton).toBeEnabled();
    await fireEvent.click(sendButton);
    const review = await screen.findByRole('dialog', {
      name: 'Review email send',
    });
    expect(registrationOutreachApi.createInvite).not.toHaveBeenCalled();
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Send 2 emails',
    }));

    await waitFor(() => {
      expect(registrationOutreachApi.createInvite).toHaveBeenCalledTimes(1);
      expect(registrationOutreachApi.sendEmail).toHaveBeenCalledTimes(1);
    });
    expect(mocks.createRegistrationInviteLink).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        targetType: 'event',
        targetId: 'event-1',
        eventId: 'event-1',
        recipientEmails: ['family@example.com', 'second@example.com'],
      }),
    );
    expect(mocks.sendRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationUrl: 'https://app.example.test/register?token=opaque',
        registrationLabel: 'Register free',
        amountCents: 0,
      }),
    );
    expect(await screen.findByText(/2 registration emails sent/)).toBeVisible();
  });

  it('creates a season invitation without trusting a client-selected event', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.messageAudiencePreview.mockResolvedValueOnce(audiencePreview({
      requestedCount: 1,
      uniqueRecipientCount: 1,
      retainedPendingActivationCount: 1,
      emailEligibleCount: 1,
      chunkSize: 1,
    }));
    mocks.createRegistrationInviteLink.mockResolvedValueOnce({
      linkId: 'registration-link-season',
      tenantId: 'tenant-a',
      targetType: 'season',
      targetId: 'season-1',
      eventId: 'season-registration-event',
      displayTitle: 'Summer 2026',
      registrationKind: 'paid',
      priceCents: 12500,
      currency: 'USD',
      recipientCount: 1,
      url: 'https://app.example.test/register?token=season-opaque',
      expiresAt: '2026-08-27T20:00:00.000Z',
      idempotentReplay: false,
      requestId: 'season-link-request',
    });
    mocks.sendRegistrationEmail.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-a',
      communicationId: 'communication-season',
      audienceMode: 'direct',
      recipientCount: 1,
      sentCount: 1,
      sentRecipients: ['family@example.com'],
      failedCount: 0,
      failures: [],
      suppressedCount: 0,
      requestId: 'season-email-request',
    });
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Start registration email' }),
    );
    await fireEvent.change(screen.getByLabelText('Registration for'), {
      target: { value: 'season' },
    });
    await fireEvent.change(screen.getByLabelText('Season'), {
      target: { value: 'season-1' },
    });
    await fireEvent.input(screen.getByLabelText('Recipient emails'), {
      target: { value: 'family@example.com' },
    });
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Season registration is open.' },
    });
    await fireEvent.click(screen.getByRole('button', {
      name: 'Review registration email',
    }));
    const review = await screen.findByRole('dialog', {
      name: 'Review email send',
    });
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Send 1 email',
    }));

    await waitFor(() => {
      expect(mocks.createRegistrationInviteLink).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'season',
          targetId: 'season-1',
        }),
      );
    });
    expect(mocks.createRegistrationInviteLink.mock.calls[0][0]).not.toHaveProperty('eventId');
    expect(mocks.sendRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationLabel: 'Register and pay',
        amountCents: 12500,
      }),
    );
  });

  it('explains when the tenant has no registered notification devices', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(emptySnapshot())
      .mockResolvedValueOnce(emptySnapshot());
    mocks.sendMessageBatch.mockResolvedValueOnce({
      success: true,
      sendId: 'send-no-devices',
      messageCount: 1,
      activeRecipientCount: 0,
      retainedRecipientCount: 0,
      publicCount: 1,
      notifications: notificationSummary({
        sentMessageCount: 0,
        noRecipientMessageCount: 1,
        eligibleAccountCount: 0,
        eligibleDeviceCount: 0,
        successCount: 0,
      }),
      requestId: 'publish-no-devices-request',
    });
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');
    await fireEvent.click(screen.getByRole('button', { name: 'New announcement' }));
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'No-device tenant announcement.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Review announcement' }));
    await confirmAnnouncementReview();

    expect(await screen.findByText(
      'Announcement published. No registered devices were available for this organization.',
    )).toBeVisible();
  });

  it('requires and publishes an event attachment', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(emptySnapshot())
      .mockResolvedValueOnce(emptySnapshot());
    mocks.sendMessageBatch.mockResolvedValueOnce({
      success: true,
      sendId: 'send-event-1',
      messageCount: 1,
      activeRecipientCount: 0,
      retainedRecipientCount: 0,
      publicCount: 1,
      notifications: notificationSummary({
        eligibleAccountCount: 1,
        eligibleDeviceCount: 1,
        successCount: 1,
      }),
      requestId: 'publish-event-request',
    });
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');
    await fireEvent.click(screen.getByRole('button', { name: 'New announcement' }));
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Event announcement.' },
    });
    await fireEvent.change(screen.getByLabelText('Attach announcement to'), {
      target: { value: 'event' },
    });
    expect(screen.getByRole('button', { name: 'Review announcement' })).toBeDisabled();
    await fireEvent.change(screen.getByLabelText('Event'), {
      target: { value: 'event-1' },
    });
    expect(screen.getByRole('button', { name: 'Review announcement' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Review announcement' }));
    await confirmAnnouncementReview();
    await waitFor(() => expect(backendClient.sendMessageBatch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(backendClient.sendMessageBatch).mock.calls[0][1][0]).toEqual(
      expect.objectContaining({
        attachmentScope: 'event',
        eventId: 'event-1',
        eventTeamId: 'varsity',
        eventTitle: 'Summer Showcase',
        eventImageUrl: 'https://example.com/showcase.webp',
        seasonId: 'season-1',
        seasonTitle: 'Summer 2026',
        importance: 'featured',
        associationColorHex: '#2457d6',
      }),
    );
  });

  it('requires and publishes a season attachment', async () => {
    mocks.getDocs
      .mockResolvedValueOnce(emptySnapshot())
      .mockResolvedValueOnce(emptySnapshot());
    mocks.sendMessageBatch.mockResolvedValueOnce({
      success: true,
      sendId: 'send-season-1',
      messageCount: 1,
      activeRecipientCount: 0,
      retainedRecipientCount: 0,
      publicCount: 1,
      notifications: notificationSummary({
        eligibleAccountCount: 1,
        eligibleDeviceCount: 1,
        successCount: 1,
      }),
      requestId: 'publish-season-request',
    });
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');
    await fireEvent.click(screen.getByRole('button', { name: 'New announcement' }));
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Season announcement.' },
    });
    await fireEvent.change(screen.getByLabelText('Attach announcement to'), {
      target: { value: 'season' },
    });
    expect(screen.getByRole('button', { name: 'Review announcement' })).toBeDisabled();
    await fireEvent.change(screen.getByLabelText('Season'), {
      target: { value: 'season-1' },
    });
    expect(screen.getByRole('button', { name: 'Review announcement' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Review announcement' }));
    await confirmAnnouncementReview();
    await waitFor(() => expect(backendClient.sendMessageBatch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(backendClient.sendMessageBatch).mock.calls[0][1][0]).toEqual(
      expect.objectContaining({
        attachmentScope: 'season',
        eventId: null,
        eventTeamId: 'varsity',
        eventImageUrl: 'https://example.com/summer.webp',
        seasonId: 'season-1',
      }),
    );
  });
});
