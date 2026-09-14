import { act, render, waitFor } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ crmTenantBranding: vi.fn() }));

vi.mock('../../src/lib/firebase', () => ({
  auth: {},
  firebaseEnvironment: { config: { projectId: 'huddleway-dev' } },
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: { crmTenantBranding: mocks.crmTenantBranding },
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable<string | null>(null),
    availableTenants: writable<string[]>([]),
    tenantNamesStore: writable<Record<string, string>>({}),
  };
});

vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));

import { tenantIdStore } from '../../src/lib/authStore';
import CrmShellSearchHarness from '../fixtures/CrmShellSearchHarness.svelte';

const TestedHarness = CrmShellSearchHarness as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

function brandingResponse(data: Record<string, unknown>) {
  return {
    schemaVersion: 'crm_tenant_branding_v1',
    tenantId: 'tenant-a',
    exists: true,
    branding: {
      name: '',
      logoUrl: null,
      primaryColor: '',
      secondaryColor: '',
      tertiaryColor: '',
      ...data,
    },
    requestId: 'branding-request',
  };
}

function themeRoot(container: HTMLElement) {
  const root = container.querySelector<HTMLElement>('.crm-ui-shell-root');
  if (!root) throw new Error('CRM theme root was not rendered.');
  return root;
}

describe('CRM shell tenant theme lifecycle', () => {
  beforeEach(() => {
    mocks.crmTenantBranding.mockReset();
    tenants.set(null);
  });

  it('starts with HuddleWay colors and applies a tenant snapshot', async () => {
    mocks.crmTenantBranding.mockResolvedValue(brandingResponse({
      name: 'Alpha League',
      primaryColor: '#112233',
      secondaryColor: '#445566',
      tertiaryColor: '#DDEEFF',
    }));
    tenants.set('tenant-a');
    const { container } = render(TestedHarness);

    const root = themeRoot(container);
    await waitFor(() => {
      expect(mocks.crmTenantBranding).toHaveBeenCalledWith('tenant-a');
      expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#112233');
      expect(root.style.getPropertyValue('--crm-brand-secondary')).toBe('#445566');
      expect(root).toHaveAttribute('data-branding-state', 'ready');
    });
  });

  it('resets on tenant switch and ignores the previous tenant callback', async () => {
    let resolveTenantA: (value: ReturnType<typeof brandingResponse>) => void = () => {};
    mocks.crmTenantBranding.mockImplementation((tenantId: string) => {
      if (tenantId === 'tenant-a') {
        return new Promise((resolve) => { resolveTenantA = resolve; });
      }
      return Promise.resolve({
        ...brandingResponse({
          primaryColor: '#0000AA',
          secondaryColor: '#FFFF00',
          tertiaryColor: '#FFFFFF',
        }),
        tenantId: 'tenant-b',
      });
    });
    tenants.set('tenant-a');
    const { container } = render(TestedHarness);
    const root = themeRoot(container);
    await waitFor(() => expect(mocks.crmTenantBranding).toHaveBeenCalledWith('tenant-a'));

    tenants.set('tenant-b');
    await waitFor(() =>
      expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#0000AA'));
    await act(() => resolveTenantA(brandingResponse({ primaryColor: '#AA0000' })));
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#0000AA');
  });

  it('falls back for a missing or failed branding document', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.crmTenantBranding
      .mockResolvedValueOnce({
        ...brandingResponse({}),
        exists: false,
        branding: null,
      })
      .mockRejectedValueOnce({ status: 403 });
    tenants.set('tenant-a');
    const { container } = render(TestedHarness);
    const root = themeRoot(container);

    await waitFor(() => expect(root).toHaveAttribute('data-branding-state', 'missing'));
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#003366');

    tenants.set('tenant-b');
    await waitFor(() => expect(root).toHaveAttribute('data-branding-state', 'permission'));
    expect(root.style.getPropertyValue('--crm-brand-primary')).toBe('#003366');
  });
});
