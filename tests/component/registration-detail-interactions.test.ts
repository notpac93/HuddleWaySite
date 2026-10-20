import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import { readFile } from 'node:fs/promises';
import { compile } from '@tailwindcss/node';
import { chromium } from '@playwright/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dataMocks = vi.hoisted(() => ({
  getRegistrationFormFinancials: vi.fn(),
  getUserFinancialsForEvents: vi.fn(),
  downloadCsv: vi.fn(),
}));
const mutationMocks = vi.hoisted(() => ({
  updateRegistrationForm: vi.fn(),
}));

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: mutationMocks,
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    DataStore: {
      getRegistrationFormFinancials:
        dataMocks.getRegistrationFormFinancials,
      getUserFinancialsForEvents:
        dataMocks.getUserFinancialsForEvents,
    },
    transactionsStore: writable([]),
    invoicesStore: writable([]),
    refundsStore: writable([]),
    eventsStore: writable([]),
  };
});

vi.mock('../../src/lib/ui/csvExport', () => ({
  downloadCsv: dataMocks.downloadCsv,
}));

import RegistrationDetail from '../../src/components/crm/registration/RegistrationDetail.svelte';

const TestedRegistrationDetail =
  RegistrationDetail as unknown as Component;

const selectedForm = {
  id: 'form-1',
  name: 'Fall Registration',
  status: 'Open',
  program: '12U',
};

function participant(index: number) {
  return {
    id: `registration-${String(index).padStart(2, '0')}`,
    status: index === 11 ? 'Waitlisted' : 'Active',
    participantName: `Participant ${index}`,
    email: `participant-${index}@example.test`,
    userId: `user-${index}`,
    date: new Date(`2026-07-${String(index).padStart(2, '0')}T12:00:00.000Z`),
  };
}

describe('RegistrationDetail table interactions', () => {
  beforeEach(() => {
    dataMocks.downloadCsv.mockReset();
    dataMocks.getRegistrationFormFinancials.mockReset();
    dataMocks.getUserFinancialsForEvents.mockReset();
    mutationMocks.updateRegistrationForm.mockReset();
    mutationMocks.updateRegistrationForm.mockResolvedValue({ id: 'form-1' });
    dataMocks.getRegistrationFormFinancials.mockReturnValue({
      totalCollected: 12_500,
      totalFees: 500,
      totalRefunds: 1_000,
      totalBalance: 2_500,
      totalsAvailable: true,
      currency: 'USD',
      financialRecordCount: 12,
      scopeReason: 'Loaded connected event scope.',
    });
    dataMocks.getUserFinancialsForEvents.mockImplementation(
      (userId: string) => ({
        paymentStatus: userId === 'user-2' ? 'Open Balance' : 'Paid',
      }),
    );
  });

  it('keeps the filtered participant row and pager reachable in the real browser flex layout', async () => {
    const rendered = render(TestedRegistrationDetail, {
      tenantId: 'tenant-a', selectedForm,
      connectedEvents: [{ id: 'event-layout', title: 'Connected fixture event' }],
      participants: [participant(1), participant(2)],
    });
    await fireEvent.input(screen.getByLabelText('Search participants'), {
      target: { value: 'Participant 1' },
    });
    // Use the actual rendered detail and the manager's actual layout classes.
    // JSDOM does not compute flex geometry, so measure in an offline browser.
    const managerSource = await readFile('src/components/crm/registration/RegistrationManager.svelte', 'utf8');
    const managerClass = managerSource.match(/<div class="(h-full[^"\n]+)"/)![1];
    const html = `<div class="layout-root"><main class="layout-main"><header class="layout-header">Program</header><div class="layout-content"><div class="layout-slot"><div class="layout-back">More</div><div class="${managerClass}" data-manager>${rendered.container.innerHTML}</div></div></div></main><nav class="layout-footer">Admin navigation</nav></div>`;
    const compiler = await compile('@import "tailwindcss";', { base: process.cwd(), onDependency() {} });
    const candidates = [...html.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/));
    const css = compiler.build(candidates) + `
      .layout-root{display:flex;flex-direction:column;height:100dvh;overflow:hidden}
      .layout-main{display:flex;flex:1;min-height:0;flex-direction:column;overflow-y:auto}
      .layout-header{position:sticky;top:0;z-index:40;flex-shrink:0;min-height:68px}
      .layout-content,.layout-slot{display:flex;flex:1;min-height:0;flex-direction:column}
      .layout-back{padding:12px 16px;min-height:56px}
      .layout-footer{height:69px;flex-shrink:0}
      .crm-ui-table{width:100%;min-width:40rem;border-collapse:collapse}
      .crm-ui-table th,.crm-ui-table td{padding:12px 16px;white-space:nowrap}
    `;
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of [{ width: 360, height: 752 }, { width: 375, height: 667 }, { width: 1280, height: 800 }]) {
        const page = await browser.newPage({ viewport });
        await page.route('**/*', route => route.abort());
        await page.setContent(`<style>${css}</style>${html}`);
        const region = page.getByRole('region', { name: 'Scrollable participants table', exact: true });
        const manager = page.locator('[data-manager]');
        await manager.evaluate(element => { element.scrollTop = element.scrollHeight; });
        const geometry = await region.evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight }));
        expect(geometry.client).toBeGreaterThan(100);
        expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
        const footerTop = await page.locator('.layout-footer').evaluate(element => element.getBoundingClientRect().top);
        for (const target of [region.locator('tbody tr').first(), region.getByText('1 - 1 of 1', { exact: true })]) {
          const bounds = await target.boundingBox();
          expect(bounds!.height).toBeGreaterThan(0);
          expect(bounds!.y).toBeGreaterThanOrEqual(68);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footerTop);
        }
        // Horizontal scrolling remains available without vertically clipping rows.
        if (viewport.width < 640) {
          const horizontal = await region.evaluate(element => { element.scrollLeft = element.scrollWidth; return element.scrollLeft; });
          expect(horizontal).toBeGreaterThan(0);
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }, 15000);

  it('reviews connected-event impact and requires a reason before retiring', async () => {
    render(TestedRegistrationDetail, {
      tenantId: 'tenant-a',
      selectedForm,
      connectedEvents: [{ id: 'event-1', title: 'Fall League' }],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Retire form' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Retire form: Fall Registration',
    });
    expect(dialog).toHaveTextContent('1 connected event');
    expect(dialog).toHaveTextContent('Historical responses stay readable');
    const submit = within(dialog).getByRole('button', { name: 'Retire form' });
    expect(submit).toBeDisabled();
    await fireEvent.input(within(dialog).getByLabelText(/Reason for lifecycle change/), {
      target: { value: 'Season registration has closed.' },
    });
    await fireEvent.click(within(dialog).getByRole('checkbox'));
    await fireEvent.click(submit);

    expect(mutationMocks.updateRegistrationForm).toHaveBeenCalledWith(
      'tenant-a',
      'form-1',
      expect.objectContaining({ status: 'archived' }),
      'Season registration has closed.',
      expect.stringMatching(/^registration-form-lifecycle:/),
    );
    expect(await screen.findByText(/Registration form retired/)).toBeVisible();
  });

  it('paginates stable IDs, exports selected rows, and clears hidden selection on search', async () => {
    const participants = Array.from({ length: 12 }, (_, index) =>
      participant(index + 1),
    );
    render(TestedRegistrationDetail, {
      selectedForm,
      participants,
      connectedEvents: [{
        id: 'event-1',
        title: 'Fall League',
        type: 'League',
        date: '2026-09-01T12:00:00.000Z',
        paymentTerms: { currency: 'usd' },
        priceCents: 12_500,
      }],
    });

    expect(
      screen.getByRole('button', {
        name: 'Back to registration forms',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Registration Form' })).toBeVisible();
    expect(screen.queryByText('Registration ID')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search by participant name or email')).toBeVisible();
    expect(screen.getAllByText('$125.00')).toHaveLength(2);
    expect(screen.getByText(/9\/1\/2026/)).toBeVisible();
    expect(screen.getByText('1 - 10 of 12')).toBeVisible();

    await fireEvent.click(
      screen.getByLabelText('Select all participants on this page'),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(dataMocks.downloadCsv).toHaveBeenCalledTimes(1);
    expect(dataMocks.downloadCsv.mock.calls[0][0]).toHaveLength(10);
    expect(dataMocks.downloadCsv.mock.calls[0][0][0]).toMatchObject({
      registrationId: 'registration-01',
      participant: 'Participant 1',
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('11 - 12 of 12')).toBeVisible();
    expect(
      screen.getByLabelText('Select Participant 11'),
    ).not.toBeChecked();

    await fireEvent.input(screen.getByLabelText('Search participants'), {
      target: { value: 'Participant 11' },
    });
    expect(screen.getByText('1 - 1 of 1')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(dataMocks.downloadCsv).toHaveBeenCalledTimes(2);
    expect(dataMocks.downloadCsv.mock.calls[1][0]).toEqual([
      expect.objectContaining({
        registrationId: 'registration-11',
        participant: 'Participant 11',
      }),
    ]);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Clear search' }),
    );
    expect(screen.getByText('1 - 10 of 12')).toBeVisible();
  });

  it('labels incomplete scope, refuses derived payment labels, and tolerates a missing ID', () => {
    dataMocks.getRegistrationFormFinancials.mockReturnValue({
      totalCollected: 0,
      totalFees: 0,
      totalRefunds: 0,
      totalBalance: 0,
      totalsAvailable: false,
      currency: null,
      financialRecordCount: 0,
      scopeReason: 'The connected-event projection is incomplete.',
    });
    render(TestedRegistrationDetail, {
      selectedForm,
      participants: [
        participant(1),
        {
          id: '',
          status: '',
          participantName: 'Malformed Registration',
          email: '',
          userId: '',
          date: null,
        },
      ],
      connectedEvents: [{
        id: 'event-1',
        title: 'Unpriced Event',
        type: 'Camp',
        date: 'not-a-date',
        currency: 'US dollars',
        priceCents: 10.5,
      }],
      participantsTruncated: true,
      eventsTruncated: true,
      limit: 500,
    });

    expect(screen.getByText(/Showing 2 loaded participants/)).toBeVisible();
    expect(screen.getByText(/Showing 1 connected event\./)).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('Date unavailable')).toBeVisible();
    expect(screen.getByText('Price unavailable')).toBeVisible();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
    expect(screen.queryByText('No financial activity')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Select Malformed Registration'),
    ).toBeDisabled();
    expect(
      dataMocks.getUserFinancialsForEvents,
    ).not.toHaveBeenCalled();
  });

  it('uses same-event registration currency and explicit payment status for legacy events', () => {
    render(TestedRegistrationDetail, {
      selectedForm,
      participants: [{
        ...participant(1),
        eventId: 'legacy-event-1',
        currency: 'USD',
        paymentStatus: 'paid',
      }],
      connectedEvents: [{
        id: 'legacy-event-1',
        title: 'Legacy priced event',
        priceCents: 100,
        date: '2026-09-01T12:00:00.000Z',
      }],
    });

    expect(screen.getByText('Type unavailable')).toBeVisible();
    expect(screen.getByText('$1.00')).toBeVisible();
    expect(screen.getAllByText('Paid')).toHaveLength(2);
    expect(dataMocks.getUserFinancialsForEvents).not.toHaveBeenCalled();
  });

  it('keeps missing financial authority distinct from zero while displaying the bound refund status', () => {
    dataMocks.getRegistrationFormFinancials.mockReturnValue({
      totalCollected: 0, totalFees: 0, totalRefunds: 0, totalBalance: 0,
      totalsAvailable: false, currency: null, financialRecordCount: 0,
      scopeReason: 'Financial projection unavailable.',
    });
    render(TestedRegistrationDetail, {
      selectedForm,
      participants: [{ ...participant(1), paymentStatus: 'refunded' }],
      connectedEvents: [{ id: 'event-1', title: 'Event' }],
    });
    expect(screen.queryByText('No financial activity')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('Refunded')).toBeVisible();
    expect(dataMocks.getUserFinancialsForEvents).not.toHaveBeenCalled();
  });

  it('renders loading/error/empty states and disables empty export', () => {
    render(TestedRegistrationDetail, {
      selectedForm,
      participants: [],
      connectedEvents: [],
      isLoadingParticipants: true,
      error: 'Registration detail could not be loaded.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Registration detail could not be loaded.',
    );
    expect(screen.getByText('Loading participants...')).toBeVisible();
    expect(
      screen.getByText(
        'No events are currently using this registration form.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});
