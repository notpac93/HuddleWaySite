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
const backendMocks = vi.hoisted(() => ({
  uploadImageAsset: vi.fn(),
  publishProgramMedia: vi.fn(),
  updateMedia: vi.fn(),
  deleteMedia: vi.fn(),
}));

vi.mock('../../src/lib/firebase', () => ({ db: {}, firebaseApp: {} }));
vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));
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
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({ collectionName, id })),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-time'),
}));
vi.mock('firebase/storage', () => ({
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
    activeTenantRole: writable('owner'),
    userStore: writable({ uid: 'owner-a', email: 'owner@example.test' }),
  };
});

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return { eventsStore: writable([]), seasonsStore: writable([]) };
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
    Object.values(backendMocks).forEach((mock) => mock.mockReset());
    backendMocks.updateMedia.mockResolvedValue({ success: true });
    backendMocks.deleteMedia.mockResolvedValue({ success: true });
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

  it('keeps metadata changes and removal behind audited backend commands', async () => {
    render(TestedMediaManager);
    firestoreMocks.observers.at(-1)?.next({
      docs: [document('banner-a', {
        fileName: 'Original banner.png',
        imageUrl: 'https://cdn.example.test/banner.png',
        category: 'Banners',
        purpose: 'Homepage banner',
        altText: 'Players entering the field',
      })],
    });

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Open details for Original banner.png' }),
    );
    await fireEvent.input(screen.getByLabelText('Filename'), {
      target: { value: 'Opening day banner.png' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save metadata' }));

    await waitFor(() => expect(backendMocks.updateMedia).toHaveBeenCalledTimes(1));
    expect(backendMocks.updateMedia).toHaveBeenCalledWith(
      'tenant-a',
      'banner-a',
      expect.objectContaining({ fileName: 'Opening day banner.png' }),
      'Correct reusable media metadata.',
      expect.stringContaining('program-media-update'),
    );

    await fireEvent.click(screen.getByRole('button', { name: 'Remove asset' }));
    await fireEvent.input(screen.getByLabelText('Removal reason'), {
      target: { value: 'Retired after the season ended.' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));

    await waitFor(() => expect(backendMocks.deleteMedia).toHaveBeenCalledTimes(1));
    expect(backendMocks.deleteMedia).toHaveBeenCalledWith(
      'tenant-a',
      'banner-a',
      'Retired after the season ended.',
      expect.stringContaining('program-media-delete'),
    );
    expect(screen.getByText('Asset archived and removed from the active library.')).toBeVisible();
  });
});
