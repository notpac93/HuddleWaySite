import { describe, expect, it } from 'vitest';
import { BackendApi } from '../../src/lib/api/BackendApi';

function overview() {
  return {
    tenantId: 'fixture-tenant', transactions: [], refunds: [], invoices: [], deposits: [],
    recordCounts: { transactions: 0, payments: 0, refunds: 0, invoices: 0, deposits: 0 },
    tracking: { complete: true, unreconciledTransactionCount: 0, unreconciledDepositCount: 0, sourceCollections: [] },
    truncated: { transactions: false, refunds: false, invoices: false, deposits: false },
    complete: true,
    operations: {
      complete: true, generatedAt: '2026-10-07T15:00:00.000Z', timeZone: 'America/Los_Angeles',
      reconciliation: { complete: true, unreconciledTransactionCount: 0, unreconciledDepositCount: 0, currencyIntegrityErrorCount: 0 },
      views: { deposits: [], transactions: [], scheduled: [], overdue: [], invoices: [] },
    },
    requestId: 'fixture-finance',
  };
}

function apiFor(payload: unknown) {
  return new BackendApi({
    baseUrl: 'https://api.example.test', getIdToken: async () => 'fixture-token',
    fetch: async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
}

describe('financial overview reconciliation boundary', () => {
  it('accepts a complete reconciliation projection', async () => {
    await expect(apiFor(overview()).financialOverview('fixture-tenant')).resolves.toEqual(overview());
  });

  it.each([undefined, null, {}, { complete: 'true' },
    { complete: true, unreconciledTransactionCount: -1, unreconciledDepositCount: 0, currencyIntegrityErrorCount: 0 },
  ])('rejects malformed reconciliation before the finance view renders: %j', async (reconciliation) => {
    const payload = overview();
    Object.assign(payload.operations, { reconciliation });
    await expect(apiFor(payload).financialOverview('fixture-tenant')).rejects.toMatchObject({ status: 502, code: 'invalid_backend_response' });
  });
});
