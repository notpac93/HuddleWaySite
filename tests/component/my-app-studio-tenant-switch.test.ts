import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SnapshotSubscription = {
  collectionName: string;
  tenantId: string;
  next: (snapshot: any) => void;
  error: (reason: unknown) => void;
};

const snapshotSubscriptions: SnapshotSubscription[] = [];
const appMocks = vi.hoisted(() => ({
  appConfiguration: vi.fn(),
  publishAppConfiguration: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({
  db: {},
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
  };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: appMocks,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, collectionName: string) => ({
    kind: 'collection',
    collectionName,
  })),
  limit: vi.fn((value: number) => ({ kind: 'limit', value })),
  onSnapshot: vi.fn((
    queryValue: { parts: any[] },
    next: (snapshot: any) => void,
    error: (reason: unknown) => void,
  ) => {
    const collectionName =
      queryValue.parts.find((part) => part.kind === 'collection')?.collectionName;
    const tenantId =
      queryValue.parts.find(
        (part) => part.kind === 'where' && part.field === 'tenantId',
      )?.value;
    snapshotSubscriptions.push({
      collectionName,
      tenantId,
      next,
      error,
    });
    return vi.fn();
  }),
  orderBy: vi.fn((field: string, direction: string) => ({
    kind: 'orderBy',
    field,
    direction,
  })),
  query: vi.fn((...parts: any[]) => ({ parts })),
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    kind: 'where',
    field,
    operator,
    value,
  })),
}));

import { tenantIdStore } from '../../src/lib/authStore';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import MyAppStudio from '../../src/components/crm/MyAppStudio.svelte';

const TestedMyAppStudio = MyAppStudio as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;
const configNames = new Map<string, string>();

function configurationSnapshot(tenantId: string) {
  return {
    tenantId,
    mode: 'update' as const,
    versionToken: `version-${tenantId}-${configNames.get(tenantId)}`,
    configuration: {
      name: configNames.get(tenantId)
        || (tenantId === 'tenant-a' ? 'Alpha League' : 'Beta League'),
      primaryColor: '#112233',
      secondaryColor: '#223344',
      tertiaryColor: '#ffffff',
      logoUrl: 'https://cdn.example.test/logo.png',
      navigationTabs: [
        {
          key: 'home',
          pageId: 'home_page',
          route: '/',
          label: 'Home',
          enabled: true,
        },
      ],
    },
    requestId: `request-${tenantId}`,
  };
}

function publishResult() {
  return {
    success: true,
    operationId: 'configuration-operation',
    idempotentReplay: false,
    requestId: 'publish-request',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function subscription(collectionName: string, tenantId: string) {
  const result = snapshotSubscriptions.find(
    (entry) =>
      entry.collectionName === collectionName && entry.tenantId === tenantId,
  );
  if (!result) throw new Error(`Missing ${collectionName} subscription for ${tenantId}`);
  return result;
}

function rosterSnapshot(name: string) {
  return {
    docs: [{
      id: `registration-${name}`,
      data: () => ({ participantSummary: { fullName: name } }),
    }],
  };
}

function eventSnapshot(title: string) {
  return {
    empty: false,
    docs: [{
      id: `event-${title}`,
      data: () => ({
        title,
        date: { toDate: () => new Date('2026-08-01T17:00:00.000Z') },
        location: 'Field 1',
      }),
    }],
  };
}

describe('MyAppStudio tenant preview isolation', () => {
  beforeEach(() => {
    snapshotSubscriptions.length = 0;
    configNames.clear();
    tenants.set('tenant-a');
    appMocks.appConfiguration.mockReset();
    appMocks.appConfiguration.mockImplementation(
      async (tenantId: string) => configurationSnapshot(tenantId),
    );
    appMocks.publishAppConfiguration.mockReset();
    appMocks.publishAppConfiguration.mockImplementation(
      async (
        tenantId: string,
        data: { name: string },
      ) => {
        configNames.set(tenantId, data.name);
        return publishResult();
      },
    );
  });

  it('clears tenant A previews while B loads and ignores delayed A callbacks', async () => {
    render(TestedMyAppStudio);

    await waitFor(() => {
      expect(snapshotSubscriptions).toHaveLength(2);
    });
    await act(async () => {
      subscription('registrations', 'tenant-a').next(rosterSnapshot('Alpha Player'));
      subscription('events', 'tenant-a').next(eventSnapshot('Alpha Match'));
    });
    expect(screen.getByText('Alpha Player')).toBeVisible();
    expect(screen.getByText('Alpha Match')).toBeVisible();

    await act(async () => {
      tenants.set('tenant-b');
    });
    expect(screen.queryByText('Alpha Player')).toBeNull();
    expect(screen.queryByText('Alpha Match')).toBeNull();
    expect(screen.getByText('Loading roster preview…')).toBeVisible();
    expect(screen.getByText('Loading schedule preview…')).toBeVisible();

    await act(async () => {
      subscription('registrations', 'tenant-a').next(rosterSnapshot('Stale Alpha Player'));
      subscription('events', 'tenant-a').next(eventSnapshot('Stale Alpha Match'));
    });
    expect(screen.queryByText('Stale Alpha Player')).toBeNull();
    expect(screen.queryByText('Stale Alpha Match')).toBeNull();

    await waitFor(() => {
      expect(snapshotSubscriptions).toHaveLength(4);
    });
    await act(async () => {
      subscription('registrations', 'tenant-b').next(rosterSnapshot('Beta Player'));
      subscription('events', 'tenant-b').next(eventSnapshot('Beta Match'));
    });
    expect(screen.getByText('Beta Player')).toBeVisible();
    expect(screen.getByText('Beta Match')).toBeVisible();
  });

  it('locks the reviewed configuration, publishes once, and verifies readback', async () => {
    const pending = deferred<void>();
    appMocks.publishAppConfiguration.mockImplementationOnce(
      async (
        tenantId: string,
        data: { name: string },
      ) => {
        await pending.promise;
        configNames.set(tenantId, data.name);
        return publishResult();
      },
    );
    render(TestedMyAppStudio);
    const nameInput = await screen.findByLabelText('App Name');
    expect(screen.getByAltText('Logo Preview')).toHaveAttribute(
      'src',
      'https://cdn.example.test/logo.png',
    );
    await fireEvent.input(nameInput, {
      target: { value: 'Alpha League Updated' },
    });
    const publish = screen.getByRole('button', { name: 'Publish App' });
    await fireEvent.click(publish);
    await fireEvent.click(publish);

    expect(appMocks.publishAppConfiguration).toHaveBeenCalledTimes(1);
    expect(nameInput).toBeDisabled();
    expect(screen.getByLabelText('Primary brand color')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Publishing...' }),
    ).toBeDisabled();
    pending.resolve();

    expect(
      await screen.findByText(
        'App configuration published and reloaded from the server.',
      ),
    ).toBeVisible();
    expect(nameInput).toHaveValue('Alpha League Updated');
    expect(appMocks.appConfiguration).toHaveBeenCalledTimes(2);
  });

  it('masks publish failures and reuses the same key on unchanged retry', async () => {
    appMocks.publishAppConfiguration.mockRejectedValueOnce(
      new BackendApiError({
        message: 'raw provider detail',
        status: 503,
        code: 'publish_failed',
        requestId: 'publish-support-8',
      }),
    );
    render(TestedMyAppStudio);
    await fireEvent.input(await screen.findByLabelText('App Name'), {
      target: { value: 'Alpha League Retitled' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Publish App' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The app configuration could not be published.',
    );
    expect(alert).toHaveTextContent('Support request: publish-support-8');
    expect(alert).not.toHaveTextContent('raw provider detail');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry Publish' }),
    );
    await screen.findByText(
      'App configuration published and reloaded from the server.',
    );
    expect(appMocks.publishAppConfiguration).toHaveBeenCalledTimes(2);
    expect(
      appMocks.publishAppConfiguration.mock.calls[1][3],
    ).toBe(appMocks.publishAppConfiguration.mock.calls[0][3]);
  });

  it('rejects a mismatched readback and clears a pending prior tenant publish', async () => {
    appMocks.publishAppConfiguration.mockResolvedValueOnce(publishResult());
    render(TestedMyAppStudio);
    await fireEvent.input(await screen.findByLabelText('App Name'), {
      target: { value: 'Not Persisted' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Publish App' }),
    );
    expect(
      await screen.findByText(/server readback did not match/i),
    ).toBeVisible();

    const pending = deferred<ReturnType<typeof publishResult>>();
    appMocks.publishAppConfiguration.mockReturnValueOnce(pending.promise);
    await fireEvent.input(screen.getByLabelText('App Name'), {
      target: { value: 'Pending Tenant A' },
    });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Publish App' }),
    );
    await act(async () => {
      tenants.set('tenant-b');
    });
    expect(await screen.findByDisplayValue('Beta League')).toBeVisible();
    pending.resolve(publishResult());
    await pending.promise;
    expect(screen.getByLabelText('App Name')).toHaveValue('Beta League');
    expect(screen.getByRole('button', { name: 'Publish App' })).toBeDisabled();
  });
});
