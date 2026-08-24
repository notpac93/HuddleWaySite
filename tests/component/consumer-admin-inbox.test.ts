import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminInboxThreads: vi.fn(),
  replyAdminInbox: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    adminInboxThreads: mocks.adminInboxThreads,
    replyAdminInbox: mocks.replyAdminInbox,
  },
}));

import { tenantIdStore } from '../../src/lib/authStore';
import ConsumerAdminInbox from '../../src/components/crm/ConsumerAdminInbox.svelte';

const TestedInbox = ConsumerAdminInbox as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function thread(tenantSuffix = 'a') {
  return {
    id: `thread-${tenantSuffix}`,
    consumerEmail: `family-${tenantSuffix}@example.com`,
    consumerName: `Family ${tenantSuffix.toUpperCase()}`,
    threadRecipientEmail: `coach-${tenantSuffix}@example.com`,
    subject: 'Schedule question',
    lastMessageAt: '2026-08-24T10:00:00.000Z',
    messages: [{
      id: `message-${tenantSuffix}`,
      direction: 'consumer' as const,
      senderName: `Family ${tenantSuffix.toUpperCase()}`,
      subject: 'Schedule question',
      message: 'When does practice start?',
      createdAt: '2026-08-24T10:00:00.000Z',
      requestId: `request-${tenantSuffix}`,
      deliveryProvider: 'resend',
    }],
  };
}

describe('ConsumerAdminInbox', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    mocks.adminInboxThreads.mockReset();
    mocks.replyAdminInbox.mockReset();
    mocks.adminInboxThreads.mockResolvedValue({
      success: true,
      tenantId: 'tenant-a',
      threads: [thread('a')],
      truncated: false,
      requestId: 'request-list-a',
    });
  });

  afterEach(() => cleanup());

  it('loads a private thread and replies through the tenant-scoped backend contract', async () => {
    mocks.replyAdminInbox.mockResolvedValue({
      success: true,
      tenantId: 'tenant-a',
      replyId: 'reply-a',
      senderAddress: 'coach-a@example.com',
      requestId: 'reply-request-a',
    });
    mocks.adminInboxThreads
      .mockResolvedValueOnce({
        success: true,
        tenantId: 'tenant-a',
        threads: [thread('a')],
        truncated: false,
        requestId: 'request-list-a',
      })
      .mockResolvedValueOnce({
        success: true,
        tenantId: 'tenant-a',
        threads: [thread('a')],
        truncated: false,
        requestId: 'request-list-a-2',
      });
    render(TestedInbox);

    await fireEvent.click(await screen.findByRole('button', {
      name: /Family A/i,
    }));
    await fireEvent.input(screen.getByLabelText('Reply'), {
      target: { value: 'Practice starts at six.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

    await waitFor(() => expect(mocks.replyAdminInbox).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      consumerEmail: 'family-a@example.com',
      threadRecipientEmail: 'coach-a@example.com',
      subject: 'Re: Schedule question',
      message: 'Practice starts at six.',
      requestId: 'request-a',
    }));
    expect(await screen.findByText(/Reply sent/i)).toBeVisible();
  });

  it('clears prior-tenant content before loading a switched tenant', async () => {
    render(TestedInbox);
    expect(await screen.findByText('family-a@example.com')).toBeVisible();

    mocks.adminInboxThreads.mockResolvedValueOnce({
      success: true,
      tenantId: 'tenant-b',
      threads: [thread('b')],
      truncated: false,
      requestId: 'request-list-b',
    });
    tenants.set('tenant-b');

    expect(await screen.findByText('family-b@example.com')).toBeVisible();
    expect(screen.queryByText('family-a@example.com')).toBeNull();
    expect(mocks.adminInboxThreads).toHaveBeenLastCalledWith('tenant-b');
  });
});
