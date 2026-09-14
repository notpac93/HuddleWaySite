import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  crmOperationalPage: vi.fn(),
  uploadImageAsset: vi.fn(),
  publishProgramMedia: vi.fn(),
  updateMedia: vi.fn(),
  deleteMedia: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
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

function page(records: Array<Record<string, unknown> & { id: string }>) {
  return { records, hasMore: false, nextCursor: null };
}

describe('MediaManager bounded tenant projection', () => {
  beforeEach(() => {
    Object.values(backendMocks).forEach((mock) => mock.mockReset());
    backendMocks.crmOperationalPage.mockResolvedValue(page([]));
    backendMocks.updateMedia.mockResolvedValue({ success: true });
    backendMocks.deleteMedia.mockResolvedValue({ success: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tenants.set('tenant-a');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters loaded records and rejects unsafe image URLs', async () => {
    backendMocks.crmOperationalPage.mockResolvedValueOnce(page([
      { id: 'logo-a', fileName: 'Falcons logo', imageUrl: 'https://cdn.example.test/logo.png', category: 'Logos', size: 20480 },
      { id: 'unsafe-a', name: 'Untrusted banner', url: 'javascript:alert(1)', category: 'Banners' },
      { id: 'uncategorized-a', url: '' },
    ]));
    render(TestedMediaManager);
    expect(screen.getByRole('status')).toHaveTextContent('Loading media files');

    expect(await screen.findByText('Falcons logo')).toBeVisible();
    const unsafeCard = screen.getByText('Untrusted banner').closest('.group');
    expect(unsafeCard).not.toBeNull();
    expect(within(unsafeCard as HTMLElement).queryByRole('img')).toBeNull();
    expect(screen.getAllByText('Uncategorized').length).toBeGreaterThan(0);

    await fireEvent.click(screen.getByRole('button', { name: /Logos/ }));
    expect(screen.getByText('Falcons logo')).toBeVisible();
    expect(screen.queryByText('Untrusted banner')).toBeNull();

    await fireEvent.input(screen.getByLabelText('Search media files'), {
      target: { value: 'missing' },
    });
    expect(screen.getByText('No media files')).toBeVisible();
  });

  it('replaces a failed remote preview with an explicit unavailable state', async () => {
    backendMocks.crmOperationalPage.mockResolvedValueOnce(page([{
      id: 'broken-a', fileName: 'Legacy banner.png', imageUrl: 'https://cdn.example.test/missing.png',
    }]));
    render(TestedMediaManager);

    const image = await screen.findByRole('img', { name: 'Legacy banner.png' });
    await fireEvent.error(image);
    expect(screen.queryByRole('img', { name: 'Legacy banner.png' })).toBeNull();
    expect(screen.getByText('Preview unavailable')).toBeVisible();
  });

  it('marks a 101-record projection incomplete and ignores stale tenant callbacks', async () => {
    let resolveTenantA: (value: ReturnType<typeof page>) => void = () => {};
    const tenantARequest = new Promise<ReturnType<typeof page>>((resolve) => { resolveTenantA = resolve; });
    backendMocks.crmOperationalPage.mockReturnValueOnce(tenantARequest);
    backendMocks.crmOperationalPage.mockResolvedValueOnce(page(
      Array.from({ length: 101 }, (_, index) => ({
        id: `media-${index}`, name: `Tenant B image ${index}`, url: '', category: 'Logos',
      })),
    ));
    render(TestedMediaManager);
    tenants.set('tenant-b');
    await waitFor(() => expect(backendMocks.crmOperationalPage).toHaveBeenCalledTimes(2));
    resolveTenantA(page([{ id: 'stale', name: 'Stale tenant image', url: '' }]));
    expect(screen.queryByText('Stale tenant image')).toBeNull();
    expect(
      await screen.findByText(/More than 100 image records exist/),
    ).toBeVisible();
    expect(screen.getByText('Tenant B image 99')).toBeVisible();
    expect(screen.queryByText('Tenant B image 100')).toBeNull();
  });

  it('shows a safe error state and clears tenant data when scope disappears', async () => {
    backendMocks.crmOperationalPage.mockRejectedValueOnce(
      Object.assign(new Error('raw permission detail'), { status: 403 }),
    );
    render(TestedMediaManager);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Media files could not be loaded. Check your access and try again.',
    );
    expect(alert).not.toHaveTextContent('raw permission detail');

    tenants.set(null);
    await waitFor(() => expect(screen.getByText('No media files')).toBeVisible());
  });

  it('keeps metadata changes and removal behind audited backend commands', async () => {
    backendMocks.crmOperationalPage.mockResolvedValueOnce(page([{
      id: 'banner-a', fileName: 'Original banner.png', imageUrl: 'https://cdn.example.test/banner.png',
      category: 'Banners', purpose: 'Homepage banner', altText: 'Players entering the field',
    }]));
    render(TestedMediaManager);

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

  it('closes the upload dialog after a completed library upload', async () => {
    backendMocks.uploadImageAsset.mockResolvedValue({ reservationId: 'reservation-a' });
    backendMocks.publishProgramMedia.mockResolvedValue({ success: true });
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:media-test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('Image', class {
      naturalWidth = 48;
      naturalHeight = 48;
      onload: null | (() => void) = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    });

    try {
      render(TestedMediaManager);
      await fireEvent.click(screen.getAllByRole('button', { name: 'Upload image' })[0]);
      await fireEvent.change(screen.getByLabelText('Image'), {
        target: { files: [new File(['image'], 'uat-upload.png', { type: 'image/png' })] },
      });
      await fireEvent.input(screen.getByLabelText('Alt text'), {
        target: { value: 'Staging upload test' },
      });
      await fireEvent.click(screen.getByRole('button', { name: 'Review upload' }));
      await fireEvent.click(screen.getByRole('button', { name: 'Upload to library' }));

      await waitFor(() => expect(backendMocks.publishProgramMedia).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: 'Review image upload' })).toBeNull();
      });
      expect(screen.getByRole('status')).toHaveTextContent('Uploaded uat-upload.png');
    } finally {
      vi.unstubAllGlobals();
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }
  });
});
