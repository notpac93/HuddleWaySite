import { get, writable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ crmOperationalPage: vi.fn(), financialOverview: vi.fn() }));
vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return { tenantIdStore: writable<string | null>(null) };
});
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: api }));
import { tenantIdStore } from '../../src/lib/authStore';
import { teamsStore, teamsProjectionScope } from '../../src/lib/services/DataStore';
import { refreshActiveData } from '../../src/lib/crm/liveRefresh';
const cleanup: Array<() => void> = [];
const page = (records: any[], hasMore = false, nextCursor: string | null = null) => ({ records, hasMore, nextCursor });
beforeEach(() => {
  tenantIdStore.set('tenant-a');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  api.crmOperationalPage.mockReset().mockResolvedValue(page([{ id: 'old-team' }]));
});
afterEach(() => { cleanup.splice(0).forEach(stop => stop()); tenantIdStore.set(null); });

describe('operational live projection', () => {
  it('keeps the complete prior list while all replacement pages load', async () => {
    let records: any[] = [];
    cleanup.push(teamsStore.subscribe(value => { records = value; }));
    await vi.waitFor(() => expect(records).toEqual([{ id: 'old-team' }]));
    let finish!: (value: unknown) => void;
    api.crmOperationalPage.mockResolvedValueOnce(page([{ id: 'new-1' }], true, 'next'))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = refreshActiveData('pull');
    await vi.waitFor(() => expect(api.crmOperationalPage).toHaveBeenCalledTimes(3));
    expect(records).toEqual([{ id: 'old-team' }]);
    expect(get(teamsProjectionScope).loading).toBe(false);
    finish(page([{ id: 'new-2' }])); await pending;
    expect(records).toEqual([{ id: 'new-1' }, { id: 'new-2' }]);
  });
  it('clears previous tenant data immediately and ignores its late result', async () => {
    let records: any[] = [];
    cleanup.push(teamsStore.subscribe(value => { records = value; }));
    await vi.waitFor(() => expect(records).toHaveLength(1));
    let finish!: (value: unknown) => void;
    api.crmOperationalPage.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = refreshActiveData('pull'); await Promise.resolve();
    api.crmOperationalPage.mockResolvedValue(page([{ id: 'tenant-b-team' }]));
    tenantIdStore.set('tenant-b'); expect(records).toEqual([]);
    await vi.waitFor(() => expect(records).toEqual([{ id: 'tenant-b-team' }]));
    finish(page([{ id: 'tenant-a-late' }])); await pending;
    expect(records).toEqual([{ id: 'tenant-b-team' }]);
  });
  it('retains records on transient failure but clears them on access denial', async () => {
    let records: any[] = [];
    cleanup.push(teamsStore.subscribe(value => { records = value; }));
    await vi.waitFor(() => expect(records).toHaveLength(1));
    api.crmOperationalPage.mockRejectedValueOnce(new Error('offline'));
    await refreshActiveData(); expect(records).toHaveLength(1);
    expect(get(teamsProjectionScope).error).toBeTruthy();
    api.crmOperationalPage.mockRejectedValueOnce({ status: 403 });
    await refreshActiveData(); expect(records).toEqual([]);
    expect(get(teamsProjectionScope).permissionDenied).toBe(true);
  });
});
