import { fireEvent, render, screen, within } from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => ({
  events: null as Writable<any[]> | null,
  registrations: null as Writable<any[]> | null,
  teams: null as Writable<any[]> | null,
  eventScope: null as Writable<any> | null,
  registrationScope: null as Writable<any> | null,
  teamScope: null as Writable<any> | null,
}));

vi.mock('../../src/lib/services/DataStore', async () => {
  const { writable } = await import('svelte/store');
  stores.events = writable([]);
  stores.registrations = writable([]);
  stores.teams = writable([]);
  stores.eventScope = writable({ loading: false, error: '', truncated: false, limit: 500 });
  stores.registrationScope = writable({ loading: false, error: '', truncated: false, limit: 500 });
  stores.teamScope = writable({ loading: false, error: '', truncated: false, limit: 500 });
  return {
    eventsStore: stores.events,
    registrationsStore: stores.registrations,
    teamsStore: stores.teams,
    eventsProjectionScope: stores.eventScope,
    registrationsProjectionScope: stores.registrationScope,
    teamsProjectionScope: stores.teamScope,
  };
});

import GlobalSearch from '../../src/components/crm/GlobalSearch.svelte';

const TestedGlobalSearch = GlobalSearch as unknown as Component;

describe('GlobalSearch bounded record routing', () => {
  beforeEach(() => {
    stores.events!.set([]);
    stores.registrations!.set([]);
    stores.teams!.set([]);
    for (const scope of [
      stores.eventScope!,
      stores.registrationScope!,
      stores.teamScope!,
    ]) {
      scope.set({ loading: false, error: '', truncated: false, limit: 500 });
    }
  });

  it('routes each stable result ID and omits identifier-less records', async () => {
    stores.registrations!.set([
      { id: 'registration-1', participantName: 'Alex Player', email: 'alex@example.test' },
      { id: '', participantName: 'Alex Missing ID', email: 'missing@example.test' },
    ]);
    stores.teams!.set([
      { id: 'team-1', name: 'Alex United', description: 'U12' },
      { name: 'Alex Team Missing ID' },
    ]);
    stores.events!.set([
      { id: 'event-1', title: 'Alex Invitational', type: 'Tournament' },
      { id: ' ', title: 'Alex Event Missing ID' },
    ]);
    const navigate = vi.fn();
    render(TestedGlobalSearch, {
      props: { isOpen: true },
      events: { navigate },
    });

    await fireEvent.input(screen.getByRole('searchbox'), {
      target: { value: 'Alex' },
    });
    expect(screen.queryByText(/Missing ID/)).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: /Alex Player/ }));
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { tab: 'Roster', id: 'registration-1' },
      }),
    );
  });

  it('fails closed for partial errors and labels bounded incomplete results', async () => {
    stores.teams!.set([{ id: 'team-1', name: 'Falcons' }]);
    stores.teamScope!.set({ loading: false, error: 'permission', truncated: false, limit: 500 });
    const { unmount } = render(TestedGlobalSearch, { isOpen: true });
    await fireEvent.input(screen.getByRole('searchbox'), {
      target: { value: 'Falcons' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Results are unavailable until all categories load successfully.',
    );
    expect(screen.queryByRole('button', { name: /Falcons/ })).toBeNull();
    unmount();

    stores.teamScope!.set({ loading: false, error: '', truncated: true, limit: 500 });
    render(TestedGlobalSearch, { isOpen: true });
    await fireEvent.input(screen.getByRole('searchbox'), {
      target: { value: 'Falcons' },
    });
    expect(screen.getByText(/results are incomplete/i)).toBeVisible();
    expect(
      within(screen.getByText('Teams').closest('div')!).getByRole('button', {
        name: /Falcons/,
      }),
    ).toBeEnabled();
  });

  it('shows loading, instruction, no-result, and Escape-close states', async () => {
    stores.eventScope!.set({ loading: true, error: '', truncated: false, limit: 500 });
    const close = vi.fn();
    const { container } = render(TestedGlobalSearch, {
      props: { isOpen: true },
      events: { close },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading searchable records');

    stores.eventScope!.set({ loading: false, error: '', truncated: false, limit: 500 });
    expect(await screen.findByText(/Search by participant name/)).toBeVisible();
    await fireEvent.input(screen.getByRole('searchbox'), {
      target: { value: 'No such record' },
    });
    expect(screen.getByText(/No results found/)).toBeVisible();
    const focusPanel = container.querySelector('div[tabindex="-1"]');
    expect(focusPanel).not.toBeNull();
    await fireEvent.keyDown(focusPanel!, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
