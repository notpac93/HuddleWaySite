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

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    adminInboxThreads: mocks.adminInboxThreads,
    crmOperationalPage: (...args: any[]) => args[1] === 'restricted_board_messages' ? Promise.resolve(emptySnapshot()) : mocks.getDocs(...args),
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
      { id: 'tenant-a_varsity', referenceId: 'varsity', name: 'Varsity', accentColorHex: '#2457d6' },
    ]),
  };
});

import { tenantIdStore } from '../../src/lib/authStore';
import { backendClient } from '../../src/lib/api/backendClient';
import { registrationOutreachApi } from '../../src/lib/api/RegistrationOutreachApi';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import CommunicationsManager from '../../src/components/crm/CommunicationsManager.svelte';

import { eventsStore, teamsStore, seasonsStore } from '../../src/lib/services/DataStore';
const eventRecords = eventsStore as Writable<any[]>;

const TestedCommunicationsManager =
  CommunicationsManager as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function messageSnapshot() {
  return {
    records: [{
      id: 'message-1',
      authorName: 'Program Director',
      subject: 'Practice update',
      body: 'Practice starts at six.',
      teamId: 'program',
      createdAt: '2026-07-26T18:00:00.000Z',
    }],
    hasMore: false,
    nextCursor: null,
  };
}

function emptySnapshot() {
  return { records: [], hasMore: false, nextCursor: null };
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
    deliveryStates: { accepted: 1 },
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

async function openMessageChoices() {
  expect(await screen.findByRole('region', { name: 'Start a new message' })).toBeVisible();
}

async function chooseMessage(kind: string) {
  await openMessageChoices();
  const name = kind === 'Start registration email' || kind === 'Email connection' || kind === 'New email' ? 'New email' : kind === 'Direct message' ? 'New direct message' : kind;
  await fireEvent.click(await screen.findByRole('button', { name }));
  if (kind === 'Email connection') {
    await fireEvent.click(screen.getByRole('button', { name: 'Email connection' }));
  } else if (kind === 'Start registration email') {
    await fireEvent.click(screen.getByRole('button', { name: 'Add registration link' }));
  } else if (name === 'New email') {
    await fireEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
  }
}

async function confirmAnnouncementReview() {
  const review = await screen.findByRole('dialog', {
    name: 'Review app announcement',
  });
  expect(within(review).queryByRole('checkbox')).not.toBeInTheDocument();
  await fireEvent.click(within(review).getByRole('button', {
    name: 'Publish announcement',
  }));
}

describe('CommunicationsManager recall boundary', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    tenants.set('tenant-a');
    eventRecords.set([{ id: 'event-1', title: 'Summer Showcase', imageUrl: 'https://example.com/showcase.webp', importance: 'featured', accentColorHex: '#2457d6', teamId: 'varsity', seasonId: 'season-1', lifecycleStatus: 'published', isVisible: true, isDeleted: false, isRegistrationEnabled: true, endDate: '2030-08-10T18:00:00Z' }]);
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

  it('opens to the inbox and keeps connection notices off the messaging page', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);
    expect(screen.getByRole('button', { name: 'Inbox' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'New message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New direct message' })).toBeEnabled();
    expect(screen.queryByText('Email needs attention')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email connection' })).not.toBeInTheDocument();
    await openMessageChoices();
    expect(screen.getByRole('button', { name: 'New announcement' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'New email' })).toBeEnabled();
  });

  it('sends direct messages only through the private in-app batch even when email is unavailable', async () => {
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    mocks.emailQuota.mockResolvedValue(quotaSnapshot({ capacityMode: 'unavailable', perSendLimit: 0 }));
    mocks.sendMessageBatch.mockResolvedValueOnce({ success: true, tenantId: 'tenant-a', publicCount: 0,
      activeRecipientCount: 0, retainedRecipientCount: 1, messageCount: 1, requestId: 'direct-send' });
    render(TestedCommunicationsManager);
    await chooseMessage('Direct message');
    await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: 'pending@example.com' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Practice is at six.' } });
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(mocks.sendMessageBatch).toHaveBeenCalledTimes(1));
    const [tenantId, messages] = mocks.sendMessageBatch.mock.calls[0];
    expect(tenantId).toBe('tenant-a');
    expect(messages).toHaveLength(1);
    expect(messages).toEqual([
      expect.objectContaining({ isSecret: true, targetEmail: 'pending@example.com', body: 'Practice is at six.', tenantId: 'tenant-a' }),
    ]);
    expect(await screen.findByText(/0 ready · 1 pending activation/)).toBeVisible();
    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Practice is at six.');
    expect(mocks.messageAudiencePreview).not.toHaveBeenCalled();
    expect(mocks.sendOneWayEmail).not.toHaveBeenCalled();
    expect(mocks.sendRegistrationEmail).not.toHaveBeenCalled();
    expect(mocks.replyAdminInbox).not.toHaveBeenCalled();
  });

  it('keeps private in-app history out of public announcement controls', async () => {
    mocks.getDocs.mockResolvedValue({ ...messageSnapshot(), records: [{ ...messageSnapshot().records[0], isSecret: true, subject: 'Private practice note' }] });
    render(TestedCommunicationsManager);
    await fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
    expect(await screen.findByText('Private practice note')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: /Private practice note/ }));
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit announcement' })).not.toBeInTheDocument();
  });

  it('retains the direct-message operation and recipients on a failed retry', async () => {
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    mocks.sendMessageBatch.mockRejectedValue(new Error('Network interrupted'));
    render(TestedCommunicationsManager);
    await chooseMessage('Direct message');
    await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: 'family@example.com' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'A private update.' } });
    for (let attempt = 0; attempt < 2; attempt++) {
      await fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
      await screen.findByText('Message could not be sent. Try again.');
    }
    expect(mocks.sendMessageBatch).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessageBatch.mock.calls[1]).toEqual(mocks.sendMessageBatch.mock.calls[0]);
    expect(screen.getByLabelText('Message')).toHaveValue('A private update.');
  });

  it('keeps a draft when returning to the inbox and resumes the same message', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);
    await chooseMessage('New email');
    await fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Retain this update' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Draft body stays here.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Back to inbox' }));
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
    expect(screen.getByLabelText('Subject')).toHaveValue('Retain this update');
    expect(screen.getByLabelText('Message')).toHaveValue('Draft body stays here.');
    expect(mocks.sendOneWayEmail).not.toHaveBeenCalled();
  });

  it('expands an announcement into its details view', async () => {
    mocks.getDocs.mockResolvedValueOnce(messageSnapshot());
    render(TestedCommunicationsManager);

    await fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
    const announcement = await screen.findByRole('button', {
      name: /Practice update/,
    });
    expect(announcement).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Sent to')).toBeNull();

    await fireEvent.click(announcement);

    expect(announcement).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Edit announcement' })).toBeVisible();
    expect(screen.getByText('All organization')).toBeVisible();
    expect(screen.queryByText('Published by')).toBeNull();
    expect(screen.getByText('Published')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Duplicate as new' })).toBeNull();
    expect(screen.getAllByText('Practice starts at six.')).toHaveLength(2);
    expect(within(screen.getByRole('group', { name: 'Message type' })).getByRole('button', { name: 'Announcements' })).toBeInTheDocument();
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

    await fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
    await fireEvent.click(await screen.findByRole('button', { name: /Practice update/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Edit announcement' }));
    expect(screen.getByRole('heading', { name: 'Edit announcement' })).toBeVisible();
    expect(screen.queryByText('Changes update this existing announcement. No new push notification is sent.')).not.toBeInTheDocument();
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
    expect(await screen.findByRole('region', { name: 'Sent messages' })).toBeVisible();
    expect(await screen.findByText('Practice update')).toBeVisible();
  });

  it('discards a cancelled announcement draft so it does not return after reload', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);
    await chooseMessage('New announcement');
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Discard this draft.' },
    });
    expect(window.sessionStorage.getItem('huddleway-message-draft:tenant-a')).toContain('Discard this draft.');
    await fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
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

    await fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
    await fireEvent.click(await screen.findByRole('button', { name: /Practice update/ }));
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
    await fireEvent.click(screen.getByRole('button', { name: 'Sent' }));
    await fireEvent.click(await screen.findByRole('button', { name: /Practice update/ }));
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
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());

    await chooseMessage('New announcement');
    expect(screen.queryByText('Only this organization’s account holders receive this announcement and notification.')).not.toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'A valid announcement body.' },
    });
    const publishButton = screen.getByRole('button', {
      name: 'Review',
    });
    expect(publishButton).toBeEnabled();

    await fireEvent.click(publishButton);

    const review = await screen.findByRole('dialog', {
      name: 'Review app announcement',
    });
    expect(backendClient.announcementAudiencePreview).toHaveBeenCalledWith(
      'tenant-a', expect.objectContaining({ audienceVisibility: 'everyone' }),
    );
    expect(within(review).getByText('12 eligible accounts')).toBeVisible();
    expect(within(review).getByText('Up to 9 active devices')).toBeVisible();
    expect(backendClient.sendMessageBatch).not.toHaveBeenCalled();
    expect(within(review).queryByRole('checkbox')).not.toBeInTheDocument();
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Publish announcement',
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
    expect(await screen.findByText('Announcement published. Notifications were accepted for delivery to 2 registered devices.')).toBeVisible();
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

    expect(screen.queryByLabelText('Email allowance')).not.toBeInTheDocument();
    expect(screen.queryByText(/Email usage checked/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Amazon SES|Resend|provider fallback/i)).not.toBeInTheDocument();
    await chooseMessage('New email');
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
      name: 'Review email',
    });
    expect(within(review).getByRole('article', { name: 'Email content preview' })).toHaveTextContent('Practice starts at six.');
    expect(within(review).getByText('39,575 of 40,000 left')).not.toBeVisible();
    await fireEvent.click(within(review).getByText('Delivery details'));
    expect(within(review).getByText('39,575 of 40,000 left')).toBeVisible();
    expect(within(review).getByText('39,573 left')).toBeVisible();
    expect(registrationOutreachApi.sendOneWayEmail).not.toHaveBeenCalled();
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Send email',
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

    await chooseMessage('New email');
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
      name: 'Review email',
    })).getByRole('button', { name: 'Send email' }));

    expect(await screen.findByText(
      '0 emails sent; 1 failed. Only failed addresses remain in the form.',
    )).toBeVisible();
    expect(screen.queryByText(/failed-email-request/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Recipient emails')).toHaveValue('family@example.com');
    expect(screen.queryByText(/Amazon SES|Resend|backup|provider/i)).not.toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Review email' });
    expect(retryButton).toBeEnabled();
    await fireEvent.click(retryButton);
    expect(await screen.findByRole('dialog', { name: 'Review email' })).toBeVisible();
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
    await chooseMessage('New email');
    await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: 'family@example.com' } });
    await fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Practice' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Starts at six.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    const review = await screen.findByRole('dialog', { name: 'Review email' });
    await fireEvent.change(within(review).getByRole('combobox', { name: 'From' }), { target: { value: 'connected_mailbox' } });
    await fireEvent.click(within(review).getByText('Delivery details'));
    expect(within(review).getByText('100 recipients')).toBeVisible();
    expect(within(review).getByRole('combobox', { name: 'From' })).toHaveValue('connected_mailbox');
    expect(within(review).queryByText('39,575 of 40,000 left')).not.toBeInTheDocument();
    await fireEvent.click(within(review).getByRole('button', { name: 'Send email' }));
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

    await chooseMessage('Email connection');
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
    await chooseMessage('New email');
    await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: emails.join('\n') } });
    await fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Schedule' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Season schedule.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    const review = await screen.findByRole('dialog', { name: 'Review email' });
    expect(within(review).getByText('101 recipients')).toBeVisible();
    expect(within(review).getByRole('combobox', { name: 'From' })).toBeDisabled();
    expect(within(review).queryByRole('radio', { name: /My email/ })).not.toBeInTheDocument();
  });

  it('clearly explains why an invalid recipient blocks review', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);

    await chooseMessage('New email');
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
    expect(screen.getByRole('alert')).toHaveTextContent('Check this email address: not-an-email');
    expect(screen.getByRole('button', { name: 'Review email' })).toBeDisabled();
  });

  it('keeps email sending available when Wall announcements fail to load', async () => {
    mocks.getDocs.mockRejectedValueOnce(new Error('missing index'));
    render(TestedCommunicationsManager);
    await fireEvent.click(screen.getByRole('button', { name: 'Sent' }));

    expect(await screen.findByText(
      'Wall announcements could not be loaded. Check your connection and try again.',
    )).toBeVisible();
    await openMessageChoices();
    expect(screen.getByRole('button', { name: 'New email' })).toBeEnabled();
    expect(screen.queryByLabelText('Email allowance')).not.toBeInTheDocument();
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

    expect(screen.queryByLabelText('Email allowance')).not.toBeInTheDocument();
    expect(screen.queryByText('Email needs attention')).not.toBeInTheDocument();
    await chooseMessage('New email');
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
    const review = await screen.findByRole('dialog', { name: 'Review email' });
    expect(review).toHaveTextContent('100 recipients');
    expect(review).not.toHaveTextContent('39,575');
    expect(review).not.toHaveTextContent('40,000');
  });

  it('keeps email drafting available when delivery is unavailable', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.emailQuota.mockResolvedValueOnce(quotaSnapshot({
      capacityMode: 'unavailable',
      monthlyAllowanceVisible: false,
      perSendLimit: 0,
    }));
    render(TestedCommunicationsManager);

    await openMessageChoices();
    expect(await screen.findByText(/Email sending is temporarily unavailable/)).toBeVisible();
    expect(screen.queryByLabelText('Email allowance')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New email' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'New direct message' })).toBeEnabled();
    await chooseMessage('New email');
    await fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Keep drafting' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'The email editor remains usable.' } });
    expect(screen.getByLabelText('Message')).toHaveValue('The email editor remains usable.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  });

  it('makes a sending pause clear while allowing email drafts', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    mocks.emailQuota.mockResolvedValueOnce(quotaSnapshot({
      emailSendingStatus: 'suspended',
      emailSuspensionReason: 'complaint_rate_threshold',
      bounceRate: 0.01,
      complaintRate: 0.001,
    }));
    render(TestedCommunicationsManager);

    await openMessageChoices();
    expect(await screen.findByText(/Email sending is paused for this organization/)).toBeVisible();
    expect(screen.queryByText(/Amazon SES|Resend|provider fallback/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New email' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'New direct message' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Email connection' })).not.toBeInTheDocument();
  });

  it('blocks review during a provider outage and recovers without losing the draft', async () => {
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    mocks.emailQuota.mockResolvedValue(quotaSnapshot({ capacityMode: 'unavailable', perSendLimit: 0 }));
    render(TestedCommunicationsManager);
    await chooseMessage('New email');
    await fireEvent.input(screen.getByLabelText('Recipient emails'), { target: { value: 'family@example.com' } });
    await fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Practice update' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Bring water.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your draft is saved');
    expect(mocks.messageAudiencePreview).not.toHaveBeenCalled();
    expect(mocks.sendOneWayEmail).not.toHaveBeenCalled();
    mocks.emailQuota.mockResolvedValue(quotaSnapshot());
    await fireEvent.click(screen.getByRole('button', { name: 'Review email' }));
    expect(await screen.findByRole('dialog', { name: 'Review email' })).toBeVisible();
    expect(screen.getByLabelText('Message')).toHaveValue('Bring water.');
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
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());
    await chooseMessage('New email');
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

  it('excludes archived or unavailable events from registration outreach without sending', async () => {
    const active = { id: 'current', title: 'Current registration', lifecycleStatus: 'published', isVisible: true,
      isDeleted: false, isRegistrationEnabled: true, endDate: '2030-08-10T18:00:00Z' };
    eventRecords.set([active,
      { ...active, id: 'archived', title: 'Archived workshop', lifecycleStatus: 'archived', status: 'published' },
      { ...active, id: 'legacy', title: 'No lifecycle', lifecycleStatus: undefined, status: 'published' },
      { ...active, id: 'hidden', title: 'Hidden workshop', isVisible: false },
      { ...active, id: 'disabled', title: 'Disabled registration', isRegistrationEnabled: false },
      { ...active, id: 'deleted', title: 'Deleted workshop', isDeleted: true },
    ]);
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());
    await chooseMessage('Start registration email');
    const events = screen.getByLabelText('Event');
    expect(within(events).getByRole('option', { name: /^Current registration/ })).toBeInTheDocument();
    for (const name of ['Archived workshop', 'No lifecycle', 'Hidden workshop', 'Disabled registration', 'Deleted workshop']) {
      expect(within(events).queryByRole('option', { name: new RegExp(name) })).toBeNull();
    }
    expect(mocks.createRegistrationInviteLink).not.toHaveBeenCalled();
    expect(mocks.sendRegistrationEmail).not.toHaveBeenCalled();
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
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());

    await chooseMessage('Start registration email');
    expect(screen.queryByText(/temporary registration link using the same registration form and payment settings as the app/)).not.toBeInTheDocument();
    await fireEvent.change(screen.getByLabelText('Event'), { target: { value: 'event-1' } });
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
      name: 'Review email',
    });
    expect(registrationOutreachApi.createInvite).not.toHaveBeenCalled();
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Send email',
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
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());
    await chooseMessage('Start registration email');
    await fireEvent.change(screen.getByLabelText('Registration for'), {
      target: { value: 'season' },
    });
    await fireEvent.change(screen.getByLabelText('Season'), { target: { value: 'season-1' } });
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
      name: 'Review email',
    });
    await fireEvent.click(within(review).getByRole('button', {
      name: 'Send email',
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
        deliveryStates: { no_recipients: 1 },
        eligibleAccountCount: 0,
        eligibleDeviceCount: 0,
        successCount: 0,
      }),
      requestId: 'publish-no-devices-request',
    });
    render(TestedCommunicationsManager);
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());
    await chooseMessage('New announcement');
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'No-device tenant announcement.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    await confirmAnnouncementReview();

    expect(await screen.findByText(
      'Announcement published. No registered devices were available for this organization.',
    )).toBeVisible();
  });

  it.each(['unknown', 'partial', 'deferred', 'audience_unsupported'])(
    'retains the same draft and operation when notification status is %s', async (state) => {
      mocks.getDocs.mockResolvedValue(emptySnapshot());
      const response = {
        success: true, tenantId: 'tenant-a', sendId: 'saved-announcement', messageCount: 1,
        activeRecipientCount: 0, retainedRecipientCount: 0, publicCount: 1, requestId: 'request-saved',
        notifications: notificationSummary({ successCount: state === 'partial' ? 1 : 0,
          failureCount: 0, deliveryStates: { [state]: 1 } }),
      };
      mocks.sendMessageBatch.mockResolvedValue(response);
      render(TestedCommunicationsManager);
      await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());
      await chooseMessage('New announcement');
      await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Keep this saved announcement.' } });
      await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
      await confirmAnnouncementReview();
      const check = await screen.findByRole('button', { name: 'Check status' });
      expect(screen.getByLabelText('Message')).toHaveValue('Keep this saved announcement.');
      expect(screen.queryByText(/No registered devices were available/)).toBeNull();
      expect(screen.queryByText(/Notifications were accepted for delivery/)).toBeNull();
      const first = mocks.sendMessageBatch.mock.calls[0];
      await fireEvent.click(check);
      await waitFor(() => expect(mocks.sendMessageBatch).toHaveBeenCalledTimes(2));
      expect(mocks.sendMessageBatch.mock.calls[1]).toEqual(first);
      expect(mocks.announcementAudiencePreview).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps announcement options compact and retains them when returning from review', async () => {
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    render(TestedCommunicationsManager);
    await chooseMessage('New announcement');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Keep this announcement text.' } });
    await fireEvent.click(screen.getByRole('button', { name: /^Audience:/ }));
    await fireEvent.click(within(screen.getByRole('group', { name: 'Post on' })).getByRole('button', { name: 'Events' }));
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Summer Showcase' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Registered only' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const review = screen.getByRole('dialog', { name: 'Review app announcement' });
    expect(within(review).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(review).getByRole('button', { name: 'Publish announcement' })).toBeEnabled();
    expect(mocks.sendMessageBatch).not.toHaveBeenCalled();
    await fireEvent.click(within(review).getByRole('button', { name: 'Back to editing' }));
    expect(screen.queryByRole('dialog', { name: 'Review app announcement' })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Audience:/ }));
    expect(within(screen.getByRole('group', { name: 'Post on' })).getByRole('button', { name: 'Events' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'Summer Showcase' })).toBeChecked();
    expect(screen.getByLabelText('Message')).toHaveValue('Keep this announcement text.');
    expect(screen.getByRole('checkbox', { name: 'Registered only' })).toBeChecked();
    await fireEvent.click(screen.getByRole('button', { name: 'All users' }));
    expect(screen.queryByRole('checkbox', { name: 'Registered only' })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(mocks.announcementAudiencePreview).toHaveBeenLastCalledWith('tenant-a', expect.objectContaining({ audienceVisibility: 'everyone', eventId: null, eventTeamId: null, seasonId: null }));
    await fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }));
    await fireEvent.click(screen.getAllByRole('button', { name: 'Back to inbox' }).at(-1)!);
    expect(screen.queryByRole('dialog', { name: 'Review app announcement' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inbox' })).toBeInTheDocument();
  });

  it('uses the canonical team relation rather than its tenant-prefixed document key', async () => {
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    render(TestedCommunicationsManager);
    await chooseMessage('New announcement');
    await fireEvent.click(screen.getByRole('button', { name: /^Audience:/ }));
    await fireEvent.click(within(screen.getByRole('group', { name: 'Post on' })).getByRole('button', { name: 'Teams' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Varsity' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Team board update.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(mocks.announcementAudiencePreview).toHaveBeenCalledWith('tenant-a', expect.objectContaining({ attachmentScope: 'team', eventTeamId: 'varsity', eventId: null, audienceVisibility: 'everyone' }));
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
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());
    await chooseMessage('New announcement');
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Event announcement.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /^Audience:/ }));
    await fireEvent.click(within(screen.getByRole('group', { name: 'Post on' })).getByRole('button', { name: 'Events' }));
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Summer Showcase' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Registered only' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    await confirmAnnouncementReview();
    await waitFor(() => expect(backendClient.sendMessageBatch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(backendClient.sendMessageBatch).mock.calls[0][1][0]).toEqual(
      expect.objectContaining({
        attachmentScope: 'event',
        eventId: 'event-1', audienceVisibility: 'event_registrants',
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
    await waitFor(() => expect(mocks.getDocs).toHaveBeenCalled());
    await chooseMessage('New announcement');
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'Season announcement.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /^Audience:/ }));
    await fireEvent.click(within(screen.getByRole('group', { name: 'Post on' })).getByRole('button', { name: 'Seasons' }));
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Summer 2026' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
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
  it('clears the review when leaving the composer and does not reopen it with a draft', async () => {
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    render(TestedCommunicationsManager);
    await chooseMessage('New announcement');
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Keep this unsent draft.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('dialog', { name: 'Review app announcement' })).toBeInTheDocument();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Back to inbox' }).at(-1)!);
    expect(screen.queryByRole('dialog', { name: 'Review app announcement' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Inbox' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Resume draft' }));
    expect(screen.getByLabelText('Message')).toHaveValue('Keep this unsent draft.');
    expect(screen.queryByRole('dialog', { name: 'Review app announcement' })).not.toBeInTheDocument();
    expect(mocks.sendMessageBatch).not.toHaveBeenCalled();
  });

  it('does not select targets or registered-only visibility when cycling categories', async () => {
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    render(TestedCommunicationsManager);
    await chooseMessage('New announcement');
    await fireEvent.click(screen.getByRole('button', { name: /^Audience:/ }));
    for (const category of ['Teams', 'Seasons', 'Events']) {
      await fireEvent.click(screen.getByRole('button', { name: category }));
      expect(screen.getByText('0 selected')).toBeInTheDocument();
      for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
      expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    }
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Summer Showcase' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Registered only' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Registered only' })).not.toBeChecked();
  });

  it.each([
    ['Teams', teamsStore, 'eventTeamIds', 'team'],
    ['Seasons', seasonsStore, 'seasonIds', 'season'],
    ['Events', eventsStore, 'eventIds', 'event'],
  ] as const)('publishes one announcement with multiple %s relations', async (category, store, field, scope) => {
    const targetStore = store as Writable<any[]>;
    targetStore.set([
      { id: 'target-a', referenceId: 'target-a', title: 'First target', name: 'First target', lifecycleStatus: 'published', isVisible: true },
      { id: 'target-b', referenceId: 'target-b', title: 'Second target', name: 'Second target', lifecycleStatus: 'published', isVisible: true },
    ]);
    mocks.getDocs.mockResolvedValue(emptySnapshot());
    render(TestedCommunicationsManager);
    await chooseMessage('New announcement');
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'One update for both targets.' } });
    await fireEvent.click(screen.getByRole('button', { name: /^Audience:/ }));
    await fireEvent.click(screen.getByRole('button', { name: category }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'First target' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Second target' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(mocks.announcementAudiencePreview).toHaveBeenCalledWith('tenant-a', expect.objectContaining({ attachmentScope: scope, [field]: ['target-a', 'target-b'] }));
    await confirmAnnouncementReview();
    expect(mocks.sendMessageBatch.mock.calls[0][1]).toHaveLength(1);
    expect(mocks.sendMessageBatch.mock.calls[0][1][0][field]).toEqual(['target-a', 'target-b']);
  });

});
