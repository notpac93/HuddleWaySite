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
  getDocs: vi.fn(),
  recallMessage: vi.fn(),
  sendRegistrationEmail: vi.fn(),
  sendMessageBatch: vi.fn(),
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
    recallMessage: mocks.recallMessage,
    sendMessageBatch: mocks.sendMessageBatch,
  },
}));

vi.mock('../../src/lib/api/RegistrationOutreachApi', () => ({
  registrationOutreachApi: {
    createInvite: mocks.createRegistrationInviteLink,
    sendEmail: mocks.sendRegistrationEmail,
  },
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    eventsStore: writable([
      { id: 'event-1', title: 'Summer Showcase' },
    ]),
    seasonsStore: writable([
      { id: 'season-1', name: 'Summer 2026' },
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
    ...overrides,
  };
}

describe('CommunicationsManager recall boundary', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    mocks.getDocs.mockReset();
    mocks.createRegistrationInviteLink.mockReset();
    mocks.recallMessage.mockReset();
    mocks.sendRegistrationEmail.mockReset();
    mocks.sendMessageBatch.mockReset();
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
    expect(screen.queryByRole('heading', { name: 'Details' })).toBeNull();

    await fireEvent.click(announcement);

    expect(announcement).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Details' })).toBeVisible();
    expect(screen.getByText('Audience')).toBeVisible();
    expect(screen.getByText('Published by')).toBeVisible();
    expect(screen.getAllByText('Practice starts at six.')).toHaveLength(1);
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
    expect(submit).toBeEnabled();
    await fireEvent.click(submit);
    await fireEvent.click(submit);

    expect(backendClient.recallMessage).toHaveBeenCalledTimes(1);
    const [tenantId, messageId, operationKey] =
      vi.mocked(backendClient.recallMessage).mock.calls[0];
    expect(tenantId).toBe('tenant-a');
    expect(messageId).toBe('message-1');
    expect(operationKey).toMatch(/^message-recall-message-1:/);
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
    await fireEvent.click(
      screen.getByRole('button', { name: 'Delete announcement' }),
    );
    expect(
      await screen.findByText('The announcement could not be deleted.'),
    ).toBeVisible();
    expect(screen.getByText('Support request: safe-recall-request')).toBeVisible();
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
    expect(screen.getByText('Only account holders in this organization can receive this announcement. Publishing sends a notification only to their registered devices.')).toBeVisible();
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'A valid announcement body.' },
    });
    const publishButton = screen.getByRole('button', {
      name: 'Publish announcement',
    });
    expect(publishButton).toBeEnabled();

    await fireEvent.click(publishButton);

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
      screen.getByRole('button', { name: 'Send registration email' }),
    );
    expect(screen.getByText(/without marking them registered/)).toBeVisible();
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
      name: 'Create link and send email',
    });
    expect(sendButton).toBeEnabled();
    await fireEvent.click(sendButton);

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
      screen.getByRole('button', { name: 'Send registration email' }),
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
      name: 'Create link and send email',
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
    await fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));

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
    expect(screen.getByRole('button', { name: 'Publish announcement' })).toBeDisabled();
    await fireEvent.change(screen.getByLabelText('Event'), {
      target: { value: 'event-1' },
    });
    expect(screen.getByRole('button', { name: 'Publish announcement' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));
    await waitFor(() => expect(backendClient.sendMessageBatch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(backendClient.sendMessageBatch).mock.calls[0][1][0]).toEqual(
      expect.objectContaining({
        attachmentScope: 'event',
        eventId: 'event-1',
        seasonId: null,
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
    expect(screen.getByRole('button', { name: 'Publish announcement' })).toBeDisabled();
    await fireEvent.change(screen.getByLabelText('Season'), {
      target: { value: 'season-1' },
    });
    expect(screen.getByRole('button', { name: 'Publish announcement' })).toBeEnabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Publish announcement' }));
    await waitFor(() => expect(backendClient.sendMessageBatch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(backendClient.sendMessageBatch).mock.calls[0][1][0]).toEqual(
      expect.objectContaining({
        attachmentScope: 'season',
        eventId: null,
        seasonId: 'season-1',
      }),
    );
  });
});
