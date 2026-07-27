import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

Element.prototype.animate = vi.fn(() => ({
  cancel: vi.fn(),
  currentTime: 0,
  finished: Promise.resolve(),
  pause: vi.fn(),
  play: vi.fn(),
})) as unknown as typeof Element.prototype.animate;

vi.mock('../../src/lib/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable(null),
    userStore: writable(null),
    availableTenants: writable([]),
  };
});

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    registrationsStore: writable([
      {
        id: 'player-1',
        participantName: 'Alex Morgan',
        participantEmail: 'alex@example.test',
      },
    ]),
    teamsStore: writable([
      { id: 'team-1', name: 'Tigers', division: 'U12' },
    ]),
    eventsStore: writable([
      { id: 'event-1', title: 'Summer Skills Camp', type: 'Camp' },
    ]),
    seasonsStore: writable([]),
    registrationsProjectionScope: writable({
      limit: 500,
      truncated: false,
      loading: false,
      error: '',
      permissionDenied: false,
    }),
    teamsProjectionScope: writable({
      limit: 500,
      truncated: false,
      loading: false,
      error: '',
      permissionDenied: false,
    }),
    eventsProjectionScope: writable({
      limit: 500,
      truncated: false,
      loading: false,
      error: '',
      permissionDenied: false,
    }),
  };
});

vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({ id: 'mock-document' })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => ({})),
  updateDoc: vi.fn(),
  where: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({
    commit: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(),
}));

import CrmShellSearchHarness from '../fixtures/CrmShellSearchHarness.svelte';
import CreateEventFormHarness from '../fixtures/CreateEventFormHarness.svelte';
import CreateRegistrationFormHarness from '../fixtures/CreateRegistrationFormHarness.svelte';
import {
  availableTenants,
  tenantIdStore,
} from '../../src/lib/authStore';
import { signOut } from 'firebase/auth';

const TestedCrmShellSearchHarness = CrmShellSearchHarness as unknown as Component;
const TestedCreateEventFormHarness = CreateEventFormHarness as unknown as Component;
const TestedCreateRegistrationFormHarness = CreateRegistrationFormHarness as unknown as Component;
const tenantChoices = availableTenants as Writable<string[]>;
const tenants = tenantIdStore as Writable<string | null>;
const signOutMock = vi.mocked(signOut);

async function openSearchFor(query: string) {
  await fireEvent.click(
    screen.getByRole('button', {
      name: 'Search across HuddleWay (Cmd+K)',
    }),
  );
  await fireEvent.input(
    await screen.findByPlaceholderText('Search players, teams, or events...'),
    { target: { value: query } },
  );
}

describe('CRM modal stacking and navigation', () => {
  beforeEach(() => {
    tenantChoices.set([]);
    tenants.set(null);
    signOutMock.mockReset();
  });

  it('routes accessible player, team, and event search results and retains each ID', async () => {
    render(TestedCrmShellSearchHarness);
    const currentTab = screen.getByRole('status', { name: 'current tab' });
    const currentResultId = screen.getByRole('status', {
      name: 'current result id',
    });

    await openSearchFor('Summer');
    await fireEvent.click(
      screen.getByRole('button', { name: /Summer Skills Camp/ }),
    );
    expect(currentTab).toHaveTextContent('Events');
    expect(currentResultId).toHaveTextContent('event-1');

    await openSearchFor('Tigers');
    await fireEvent.click(screen.getByRole('button', { name: /Tigers/ }));
    expect(currentTab).toHaveTextContent('Teams');
    expect(currentResultId).toHaveTextContent('team-1');

    await openSearchFor('Alex');
    await fireEvent.click(screen.getByRole('button', { name: /Alex Morgan/ }));
    expect(currentTab).toHaveTextContent('Roster');
    expect(currentResultId).toHaveTextContent('player-1');

    await fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    expect(currentTab).toHaveTextContent('Activity');
    expect(currentResultId).toHaveTextContent('');
  });

  it('supports mobile navigation, Escape dismissal, and focus restoration', async () => {
    render(TestedCrmShellSearchHarness);
    const menuTrigger = screen.getByRole('button', {
      name: 'Open navigation menu',
    });
    await fireEvent.click(menuTrigger);
    const mobileNavigation = screen.getByRole('dialog', {
      name: 'HuddleWay',
    });
    expect(mobileNavigation).toBeVisible();

    await fireEvent.keyDown(mobileNavigation, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'HuddleWay' })).toBeNull());
    await waitFor(() => expect(menuTrigger).toHaveFocus());

    const searchTrigger = screen.getByRole('button', {
      name: 'Search across HuddleWay (Cmd+K)',
    });
    await fireEvent.click(searchTrigger);
    const searchInput = await screen.findByLabelText(
      'Search players, teams, or events',
    );
    await fireEvent.keyDown(searchInput, { key: 'Escape' });
    await waitFor(() => expect(searchInput).not.toBeInTheDocument());
    await waitFor(() => expect(searchTrigger).toHaveFocus());

    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(
      await screen.findByLabelText('Search players, teams, or events'),
    ).toBeVisible();
  });

  it('switches organizations and retries a support-safe sign-out failure', async () => {
    tenants.set('tenant-a');
    tenantChoices.set(['tenant-a', 'tenant-b']);
    signOutMock
      .mockRejectedValueOnce(new Error('raw credential detail'))
      .mockResolvedValueOnce(undefined);
    render(TestedCrmShellSearchHarness);

    await fireEvent.click(
      screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Organization ID: tenant-b',
      }),
    );
    let currentTenant: string | null = null;
    const unsubscribe = tenants.subscribe((value) => {
      currentTenant = value;
    });
    unsubscribe();
    expect(currentTenant).toBe('tenant-b');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Open navigation menu' }),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign Out' });
    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'Sign out' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign out could not be completed.',
    );
    expect(screen.queryByText('raw credential detail')).toBeNull();

    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'Sign out' }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Sign Out' })).toBeNull();
    });
    expect(signOutMock).toHaveBeenCalledTimes(2);
  });

  it('advances event creation inside the panel without closing the modal', async () => {
    const view = render(TestedCreateEventFormHarness);

    await fireEvent.input(screen.getByLabelText('Event Title'), {
      target: { value: 'Summer Practice' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Choose the event days')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'event modal state' }),
    ).toHaveTextContent('open');

    const backdrop = view.container.querySelector<HTMLElement>(
      '.crm-ui-backdrop, .fixed.inset-0.z-0',
    );
    expect(backdrop).not.toBeNull();
    await fireEvent.click(backdrop!);
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'event modal state' }),
      ).toHaveTextContent('closed');
    });
  });

  it('advances registration creation and closes only from the backdrop', async () => {
    const view = render(TestedCreateRegistrationFormHarness);

    await fireEvent.input(screen.getByLabelText('Registration Title *'), {
      target: { value: 'Fall Registration' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      screen.getByText(
        'Configure what information parents must provide when registering.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'registration modal state' }),
    ).toHaveTextContent('open');

    const backdrop = view.container.querySelector<HTMLElement>(
      '.crm-ui-backdrop, .fixed.inset-0.z-0',
    );
    expect(backdrop).not.toBeNull();
    await fireEvent.click(backdrop!);
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'registration modal state' }),
      ).toHaveTextContent('closed');
    });
  });
});
