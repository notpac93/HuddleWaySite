import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: { request: mocks.request },
}));

import { billingOperationsApi } from '../../src/lib/api/BillingOperationsApi';

describe('billing operations API', () => {
  beforeEach(() => mocks.request.mockReset());

  it('requires billing package responses to match the active tenant', async () => {
    mocks.request.mockResolvedValue({ tenantId: 'tenant-b', packages: [] });

    await expect(billingOperationsApi.billingPackages('tenant-a'))
      .rejects.toThrow(/active organization/i);
  });

  it('sends package mutations with the stable idempotency key', async () => {
    mocks.request.mockResolvedValue({ package: { id: 'package-a' } });

    await billingOperationsApi.saveBillingPackage(
      'tenant-a',
      { name: 'Fall plan' },
      'billing-package-key',
    );

    expect(mocks.request).toHaveBeenCalledWith('/admin/billing-packages', {
      method: 'POST',
      body: { tenantId: 'tenant-a', name: 'Fall plan' },
      idempotencyKey: 'billing-package-key',
    });
  });

  it('fails closed on malformed participant agreement results', async () => {
    mocks.request.mockResolvedValue({ agreements: null });

    await expect(
      billingOperationsApi.participantInstallmentAgreements(
        'tenant-a',
        'participant-a',
      ),
    ).rejects.toThrow(/payment plans/i);
  });
});
