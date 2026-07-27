import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SnapshotObserver = {
  next: (snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void;
  error: (error: unknown) => void;
};

const firestoreMocks = vi.hoisted(() => ({
  observers: [] as SnapshotObserver[],
  unsubscribe: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  documentId: vi.fn(() => '__name__'),
  limit: vi.fn((value: number) => ({ type: 'limit', value })),
  orderBy: vi.fn((field: unknown, direction: string) => ({
    type: 'orderBy',
    field,
    direction,
  })),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  where: vi.fn((field: string, operation: string, value: unknown) => ({
    type: 'where',
    field,
    operation,
    value,
  })),
  onSnapshot: vi.fn(
    (
      _query: unknown,
      next: SnapshotObserver['next'],
      error: SnapshotObserver['error'],
    ) => {
      firestoreMocks.observers.push({ next, error });
      return firestoreMocks.unsubscribe;
    },
  ),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
  };
});

import { tenantIdStore } from '../../src/lib/authStore';
import MediaManager from '../../src/components/crm/MediaManager.svelte';

const TestedMediaManager = MediaManager as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function document(
  id: string,
  data: Record<string, unknown>,
): { id: string; data: () => Record<string, unknown> } {
  return { id, data: () => data };
}

describe('MediaManager bounded tenant projection', () => {
  beforeEach(() => {
    firestoreMocks.observers.length = 0;
    firestoreMocks.unsubscribe.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tenants.set('tenant-a');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters loaded records and rejects unsafe image URLs', async () => {
    render(TestedMediaManager);
    expect(screen.getByRole('status')).toHaveTextContent('Loading media files');

    firestoreMocks.observers.at(-1)?.next({
      docs: [
        document('logo-a', {
          fileName: 'Falcons logo',
          imageUrl: 'https://cdn.example.test/logo.png',
          category: 'Logos',
          size: '20 KB',
        }),
        document('unsafe-a', {
          name: 'Untrusted banner',
          url: 'javascript:alert(1)',
          category: 'Banners',
        }),
        document('uncategorized-a', {
          url: '',
        }),
      ],
    });

    expect(await screen.findByText('Falcons logo')).toBeVisible();
    const unsafeCard = screen.getByText('Untrusted banner').closest('.group');
    expect(unsafeCard).not.toBeNull();
    expect(within(unsafeCard as HTMLElement).queryByRole('img')).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: /Logos/ }));
    expect(screen.getByText('Falcons logo')).toBeVisible();
    expect(screen.queryByText('Untrusted banner')).toBeNull();

    await fireEvent.input(screen.getByLabelText('Search media files'), {
      target: { value: 'missing' },
    });
    expect(screen.getByText('No media files')).toBeVisible();
  });

  it('marks a 101-record projection incomplete and ignores stale tenant callbacks', async () => {
    render(TestedMediaManager);
    const tenantAObserver = firestoreMocks.observers.at(-1)!;

    tenants.set('tenant-b');
    await waitFor(() => expect(firestoreMocks.observers).toHaveLength(2));
    const tenantBObserver = firestoreMocks.observers.at(-1)!;
    expect(firestoreMocks.unsubscribe).toHaveBeenCalled();

    tenantAObserver.next({
      docs: [document('stale', { name: 'Stale tenant image', url: '' })],
    });
    expect(screen.queryByText('Stale tenant image')).toBeNull();

    tenantBObserver.next({
      docs: Array.from({ length: 101 }, (_, index) =>
        document(`media-${index}`, {
          name: `Tenant B image ${index}`,
          url: '',
          category: 'Logos',
        }),
      ),
    });
    expect(
      await screen.findByText(/More than 100 image records exist/),
    ).toBeVisible();
    expect(screen.getByText('Tenant B image 99')).toBeVisible();
    expect(screen.queryByText('Tenant B image 100')).toBeNull();
  });

  it('shows a safe error state and clears tenant data when scope disappears', async () => {
    render(TestedMediaManager);
    firestoreMocks.observers.at(-1)?.error(
      Object.assign(new Error('raw permission detail'), {
        code: 'permission-denied',
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Media files could not be loaded. Check your access and try again.',
    );
    expect(alert).not.toHaveTextContent('raw permission detail');

    tenants.set(null);
    await waitFor(() => expect(screen.getByText('No media files')).toBeVisible());
  });
});
