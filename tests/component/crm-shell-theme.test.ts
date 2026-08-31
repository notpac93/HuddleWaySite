import { act, render, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type BrandingSubscription = {
  tenantId: string;
  next: (snapshot: any) => void;
  error: (reason: unknown) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

const subscriptions: BrandingSubscription[] = [];

vi.mock('../../src/lib/firebase', () => ({ auth: {}, db: {} }));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable<string | null>(null),
    availableTenants: writable<string[]>([]),
  };
});

vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, _collection: string, tenantId: string) => ({
    tenantId,
  })),
  onSnapshot: vi.fn((
    reference: { tenantId: string },
    next: (snapshot: any) => void,
    error: (reason: unknown) => void,
  ) => {
    const unsubscribe = vi.fn();
    subscriptions.push({
      tenantId: reference.tenantId,
      next,
      error,
      unsubscribe,
    });
    return unsubscribe;
  }),
}));

import { tenantIdStore } from '../../src/lib/authStore';
import CrmShellSearchHarness from '../fixtures/CrmShellSearchHarness.svelte';

const TestedHarness = CrmShellSearchHarness as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function brandingSnapshot(data: Record<string, unknown>) {
  return { exists: () => true, data: () => data };
}

function themeRoot(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>('.crm-ui-shell-root');
  if (!root) throw new Error('CRM theme root was not rendered.');
  return root;
}

describe('CRM shell tenant theme lifecycle', () => {
  beforeEach(() => {
    subscriptions.length = 0;
    tenants.set(null);
  });

  it('starts with HuddleWay colors and applies a tenant snapshot', async () => {
    tenants.set('tenant-a');
    const { container } = render(TestedHarness);

    await waitFor(() => expect(subscriptions).toHaveLength(1));
    const root = themeRoot(container);
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#003366');

    await act(() => {
      subscriptions[0].next(brandingSnapshot({
        name: 'Alpha League',
        primaryColor: '#112233',
        secondaryColor: '#445566',
        tertiaryColor: '#DDEEFF',
      }));
    });

    await waitFor(() => {
      expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#112233');
      expect(root.style.getPropertyValue('--crm-brand-secondary')).toBe('#445566');
      expect(root).toHaveAttribute('data-branding-state', 'ready');
    });
  });

  it('resets on tenant switch and ignores the previous tenant callback', async () => {
    tenants.set('tenant-a');
    const { container } = render(TestedHarness);
    await waitFor(() => expect(subscriptions).toHaveLength(1));
    const root = themeRoot(container);

    await act(() => {
      subscriptions[0].next(brandingSnapshot({ primaryColor: '#AA0000' }));
    });
    await waitFor(() =>
      expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#AA0000'));

    tenants.set('tenant-b');
    await waitFor(() => expect(subscriptions).toHaveLength(2));
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#003366');

    await act(() => {
      subscriptions[0].next(brandingSnapshot({ primaryColor: '#00AA00' }));
    });
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#003366');

    await act(() => {
      subscriptions[1].next(brandingSnapshot({
        primaryColor: '#0000AA',
        secondaryColor: '#FFFF00',
        tertiaryColor: '#FFFFFF',
      }));
    });
    await waitFor(() =>
      expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#0000AA'));
  });

  it('falls back for a missing or failed branding document', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tenants.set('tenant-a');
    const { container } = render(TestedHarness);
    await waitFor(() => expect(subscriptions).toHaveLength(1));
    const root = themeRoot(container);

    await act(() => {
      subscriptions[0].next({ exists: () => false });
    });
    await waitFor(() => expect(root).toHaveAttribute('data-branding-state', 'missing'));
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#003366');

    await act(() => {
      subscriptions[0].error({ code: 'permission-denied' });
    });
    await waitFor(() => expect(root).toHaveAttribute('data-branding-state', 'permission'));
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#003366');
  });
});
