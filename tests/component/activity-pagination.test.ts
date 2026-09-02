import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  auditEventPage: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable('tenant-a') };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    auditEventPage: apiMocks.auditEventPage,
  },
}));

import { tenantIdStore } from '../../src/lib/authStore';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import ActivityManager from '../../src/components/crm/ActivityManager.svelte';

const TestedActivityManager = ActivityManager as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function auditEvent(id: string, actorLabel: string) {
  return {
    id,
    action: 'update',
    actionType: 'update' as const,
    actionDescription: 'updated a team',
    resourceType: 'team',
    outcome: 'succeeded' as const,
    actorRole: 'owner',
    actorLabel,
    timestamp: '2026-07-25T12:00:00.000Z',
  };
}

function auditPage(
  events: ReturnType<typeof auditEvent>[],
  {
    hasMore = false,
    nextCursor = null,
    requestId = 'request-audit',
  }: {
    hasMore?: boolean;
    nextCursor?: string | null;
    requestId?: string;
  } = {},
) {
  return {
    events,
    truncated: hasMore,
    hasMore,
    nextCursor,
    limit: 50,
    requestId,
  };
}

describe('ActivityManager cursor pagination', () => {
  beforeEach(() => {
    tenants.set('tenant-a');
    apiMocks.auditEventPage.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the next audited page with the returned opaque cursor and deduplicates IDs', async () => {
    apiMocks.auditEventPage.mockImplementation(
      async (_tenantId: string, _limit: number, cursor?: string) =>
        cursor
          ? auditPage(
              [auditEvent('audit-1', 'Duplicate Owner'), auditEvent('audit-2', 'Owner Two')],
              { requestId: 'request-2' },
            )
          : auditPage([auditEvent('audit-1', 'Owner One')], {
              hasMore: true,
              nextCursor: 'cursor-2',
              requestId: 'request-1',
            }),
    );
    render(TestedActivityManager);

    expect(await screen.findByText('Owner One')).toBeVisible();
    expect(screen.getByText(/More records exist/)).toBeVisible();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Load more activity' }),
    );
    expect(await screen.findByText('Owner Two')).toBeVisible();
    expect(screen.queryByText('Duplicate Owner')).toBeNull();
    expect(apiMocks.auditEventPage).toHaveBeenNthCalledWith(
      2,
      'tenant-a',
      50,
      'cursor-2',
    );
    expect(screen.queryByRole('button', { name: 'Load more activity' })).toBeNull();
  });

  it('shows a support-safe failure and retries the first page', async () => {
    apiMocks.auditEventPage
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'Activity is temporarily unavailable.',
          status: 503,
          code: 'audit_unavailable',
          requestId: 'request-failed-audit',
        }),
      )
      .mockResolvedValueOnce(
        auditPage([auditEvent('audit-retry', 'Recovered Owner')]),
      );
    render(TestedActivityManager);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Activity is temporarily unavailable.');
    expect(alert).not.toHaveTextContent('request-failed-audit');
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Recovered Owner')).toBeVisible();
    expect(apiMocks.auditEventPage).toHaveBeenCalledTimes(2);
  });

  it('masks permission detail and tolerates an invalid audit timestamp', async () => {
    apiMocks.auditEventPage
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'Internal policy path /tenants/tenant-a was denied.',
          status: 403,
          code: 'forbidden',
          requestId: 'request-forbidden-audit',
        }),
      )
      .mockResolvedValueOnce(
        auditPage([{
          ...auditEvent('audit-invalid-time', 'Owner With Invalid Time'),
          timestamp: 'not-a-date',
        }]),
      );
    render(TestedActivityManager);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'You do not have permission to view organization activity.',
    );
    expect(alert).not.toHaveTextContent('/tenants/tenant-a');
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Owner With Invalid Time')).toBeVisible();
    expect(screen.getByText('Timestamp unavailable')).toBeVisible();
  });

  it('ignores a delayed response after the active tenant changes', async () => {
    let resolveTenantA!: (value: ReturnType<typeof auditPage>) => void;
    apiMocks.auditEventPage.mockImplementation(async (tenantId: string) => {
      if (tenantId === 'tenant-a') {
        return new Promise<ReturnType<typeof auditPage>>((resolve) => {
          resolveTenantA = resolve;
        });
      }
      return auditPage([auditEvent('audit-b', 'Tenant B Owner')]);
    });
    render(TestedActivityManager);

    tenants.set('tenant-b');
    expect(await screen.findByText('Tenant B Owner')).toBeVisible();
    resolveTenantA(auditPage([auditEvent('audit-a', 'Stale Tenant A Owner')]));
    await waitFor(() => {
      expect(screen.queryByText('Stale Tenant A Owner')).toBeNull();
      expect(screen.getByText('Tenant B Owner')).toBeVisible();
    });
  });
});
