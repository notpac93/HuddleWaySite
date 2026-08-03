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
  getDocs: vi.fn(),
  recallMessage: vi.fn(),
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

import { tenantIdStore } from '../../src/lib/authStore';
import { backendClient } from '../../src/lib/api/backendClient';
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

describe('CommunicationsManager recall boundary', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    mocks.getDocs.mockReset();
    mocks.recallMessage.mockReset();
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

  it('requires a reason, submits one delete, and refreshes the visible message', async () => {
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
    await fireEvent.input(
      screen.getByLabelText('Reason for deletion'),
      { target: { value: 'Incorrect practice time was posted.' } },
    );
    expect(submit).toBeEnabled();
    await fireEvent.click(submit);
    await fireEvent.click(submit);

    expect(backendClient.recallMessage).toHaveBeenCalledTimes(1);
    const [tenantId, messageId, reason, operationKey] =
      vi.mocked(backendClient.recallMessage).mock.calls[0];
    expect(tenantId).toBe('tenant-a');
    expect(messageId).toBe('message-1');
    expect(reason).toBe('Incorrect practice time was posted.');
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

  it('keeps the same reason and key for a correlated retry', async () => {
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
    await fireEvent.input(
      screen.getByLabelText('Reason for deletion'),
      { target: { value: 'Duplicate announcement was posted.' } },
    );
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
    expect(secondCall[3]).toBe(firstCall[3]);
  });

  it('keeps unsupported publication disabled and labels its exact boundary', async () => {
    mocks.getDocs.mockResolvedValueOnce(emptySnapshot());
    render(TestedCommunicationsManager);
    await screen.findByText('No Wall announcements have been published.');

    await fireEvent.click(
      screen.getByRole('button', { name: 'New announcement' }),
    );
    expect(
      screen.getByText(
        'Publishing is disabled in this release because the server cannot yet preview and validate the exact public organization audience. Team-targeted announcements are not supported by the current authorization rules.',
      ),
    ).toBeVisible();
    await fireEvent.input(screen.getByLabelText('Message'), {
      target: { value: 'A valid announcement body.' },
    });
    expect(
      screen.getByRole('button', { name: 'Publish announcement' }),
    ).toBeDisabled();
    expect(backendClient.sendMessageBatch).not.toHaveBeenCalled();
  });
});
