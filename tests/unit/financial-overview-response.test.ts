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


describe('financial accounting continuation', () => {
  function batch(cursor: number, changed = false) {
    const payload = overview() as any;
    payload.transactions = Array.from({ length: 33 }, (_, index) => ({
      id: `tx-${index}`, tenantId: 'fixture-tenant', status: 'succeeded',
      grossAmount: changed && index === 0 ? 200 : 100, currency: 'USD',
      feeAmount: (cursor === 0 ? index < 25 : index >= 25) ? 30 : null,
      netAmount: (cursor === 0 ? index < 25 : index >= 25) ? 70 : null,
    }));
    payload.operations.views.transactions = payload.transactions.map((row: any, index: number) => ({ key: row.id, kind: 'transaction', label: 'Payment', context: '', amountCents: (cursor === 0 ? index < 25 : index >= 25) ? 100 : null, currency: 'USD', status: 'succeeded', statusLabel: 'Succeeded', date: null, dateLabel: '', detail: '' }));
    payload.tracking = { ...payload.tracking, complete: false, unreconciledTransactionCount: cursor ? 25 : 8,
      providerAccounting: { attempted: cursor ? 8 : 25, resolved: cursor ? 8 : 25, failed: 0, skipped: cursor ? 25 : 8, complete: false } };
    payload.accountingPage = { snapshotId: 'a'.repeat(64), cursor, nextCursor: cursor ? null : 25, candidateCount: 33 };
    return payload;
  }
  it('retains every exact verified row from all bounded provider batches', async () => {
    const urls: URL[] = [];
    const api = new BackendApi({ baseUrl: 'https://api.example.test', getIdToken: async () => 'fixture',
      fetch: async input => { const url = new URL(String(input)); urls.push(url);
        return new Response(JSON.stringify(batch(Number(url.searchParams.get('accountingCursor') || 0))), { status: 200 }); } });
    const result = await api.financialOverview('fixture-tenant');
    expect(urls).toHaveLength(2);
    expect(urls[1].searchParams.get('accountingSnapshot')).toBe('a'.repeat(64));
    expect(result.transactions).toHaveLength(33);
    expect(result.transactions.every(row => row.feeAmount === 30 && row.netAmount === 70)).toBe(true);
    expect(result.tracking).toMatchObject({ complete: true, unreconciledTransactionCount: 0,
      providerAccounting: { attempted: 33, resolved: 33, failed: 0, skipped: 0, complete: true } });
    expect(result.operations.reconciliation.complete).toBe(true);
    expect(result.operations.views.transactions).toHaveLength(33);
    expect(result.operations.views.transactions.every(row => row.amountCents === 100 && row.currency === 'USD')).toBe(true);
  });
  it.each(['changed-row', 'changed-snapshot', 'repeated-cursor', 'missing-page'])('fails closed on invalid continuation %s', async mode => {
    let calls = 0;
    const api = new BackendApi({ baseUrl: 'https://api.example.test', getIdToken: async () => 'fixture',
      fetch: async () => { const subsequent = calls++ > 0; const payload = batch(subsequent ? 25 : 0, mode === 'changed-row' && subsequent);
        if (subsequent && mode === 'changed-snapshot') payload.accountingPage.snapshotId = 'b'.repeat(64);
        if (subsequent && mode === 'repeated-cursor') payload.accountingPage.nextCursor = 25;
        if (subsequent && mode === 'missing-page') delete payload.accountingPage;
        return new Response(JSON.stringify(payload), { status: 200 }); } });
    await expect(api.financialOverview('fixture-tenant')).rejects.toMatchObject({ status: 502, code: 'invalid_backend_response' });
  });
});

describe('dashboard payment summary boundary', () => {
  const summary = () => ({ schemaVersion: 'crm_dashboard_payments_v1', tenantId: 'fixture-tenant', complete: true, totals: [{ currency: 'USD', grossAmount: 25000 }] });
  it('requests only the aggregate dashboard view', async () => {
    let requested = '';
    const api = new BackendApi({ baseUrl: 'https://api.example.test', getIdToken: async () => 'fixture', fetch: async input => {
      requested = String(input);
      return new Response(JSON.stringify(summary()), { status: 200 });
    } });
    await expect(api.dashboardPayments('fixture-tenant')).resolves.toEqual(summary());
    expect(new URL(requested).searchParams.get('view')).toBe('dashboard');
  });
  it.each([
    { tenantId: 'other-tenant' }, { complete: 'true' }, { totals: null },
    { totals: [{ currency: 'USD', grossAmount: '25000' }] },
    { totals: [{ currency: '???', grossAmount: 25000 }] },
    { complete: false },
  ])('rejects malformed or wrong-tenant summaries: %j', async patch => {
    await expect(apiFor({ ...summary(), ...patch }).dashboardPayments('fixture-tenant')).rejects.toBeDefined();
  });
});
