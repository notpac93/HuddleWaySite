import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  const roleStore = writable('owner');
  return {
    activeTenantRole: roleStore,
    setActiveTenantRole: (role: string) => roleStore.set(role),
    tenantIdStore: writable('tenant-a'),
    userStore: writable({ uid: 'owner-a', email: 'owner@example.test' }),
  };
});

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return { eventsStore: writable([]) };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: {
    deleteDocument: vi.fn(),
    documentAccessUrl: vi.fn(async () => ({
      documentId: 'document-locked',
      accessUrl: 'https://files.example.test/document?signature=temporary',
      expiresInSeconds: 300,
      requestId: 'request-access',
    })),
    documents: vi.fn(async () => ({
      tenantId: 'tenant-a',
      documents: [
        {
          id: 'document-locked',
          title: 'Player handbook',
          fileType: 'pdf',
          category: 'Handbook',
          availabilityScope: 'organization',
          isAvailable: true,
          hasApprovedStoragePath: true,
          canDelete: false,
          deleteUnavailableReason: 'This stored object is not eligible for audited deletion.',
          uploadedAt: '2026-07-01T12:00:00.000Z',
        },
        {
          id: 'document-delete',
          title: 'Outdated schedule',
          fileType: 'pdf',
          category: 'Schedule',
          availabilityScope: 'organization',
          isAvailable: true,
          hasApprovedStoragePath: true,
          canDelete: true,
          deleteUnavailableReason: null,
          uploadedAt: '2026-07-02T12:00:00.000Z',
        },
      ],
      truncated: false,
      requestId: 'request-list',
    })),
  },
}));

import { activeTenantRole } from '../../src/lib/authStore';
import DocumentsManager from '../../src/components/crm/DocumentsManager.svelte';

const TestedDocumentsManager = DocumentsManager as unknown as Component;

describe('DocumentsManager server-derived controls', () => {
  beforeEach(() => {
    (activeTenantRole as Writable<string>).set('owner');
  });

  it('disables unsupported deletion and gives a popup-blocked secure-link fallback', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(TestedDocumentsManager);

    const lockedDocument = (await screen.findByText('Player handbook')).closest('li');
    expect(lockedDocument).not.toBeNull();
    expect(
      within(lockedDocument!).getByRole('button', { name: 'Delete' }),
    ).toBeDisabled();
    expect(
      within(lockedDocument!).getByText(/not eligible for audited deletion/),
    ).toBeVisible();

    await fireEvent.click(
      within(lockedDocument!).getByRole('button', { name: 'View securely' }),
    );
    const fallback = await screen.findByRole('link', {
      name: 'Open secure document link',
    });
    expect(fallback).toHaveAttribute(
      'href',
      'https://files.example.test/document?signature=temporary',
    );
    expect(screen.getByText(/browser blocked the secure document tab/)).toBeVisible();
  });

  it('keeps deletion unavailable for a viewer even when the server record is eligible', async () => {
    (activeTenantRole as Writable<string>).set('viewer');
    render(TestedDocumentsManager);

    const eligibleDocument = (await screen.findByText('Outdated schedule')).closest('li');
    expect(eligibleDocument).not.toBeNull();
    const deleteButton = within(eligibleDocument!).getByRole('button', {
      name: 'Delete',
    });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute('title', 'Viewer access is read-only.');

    await fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete document?' })).toBeNull();
    });
  });
});
