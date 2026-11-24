import { webcrypto } from 'node:crypto';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ importTeamFromCsv: vi.fn() }));
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: api }));
vi.mock('../../src/lib/authStore', async () => ({
  tenantIdStore: (await import('svelte/store')).writable('tenant-a'),
}));

import TeamCsvImport from '../../src/components/crm/teams/TeamCsvImport.svelte';

afterEach(() => vi.unstubAllGlobals());

it('previews selected names and retries only unconfirmed writes with the same identity', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const onClose = vi.fn();
  api.importTeamFromCsv.mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockResolvedValueOnce({});
  render(TeamCsvImport as unknown as Component, { onClose });
  const source = 'Age,Team Name\n13,Red Team\n14,Blue Team\n15,BLUE TEAM';
  const file = new File([source], 'teams.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => source });
  await fireEvent.change(screen.getByLabelText('Choose CSV file'), { target: { files: [file] } });
  expect(await screen.findByText('Row 4 · Conflicts with row 3')).toBeVisible();
  expect(api.importTeamFromCsv).not.toHaveBeenCalled();

  await fireEvent.click(screen.getByRole('button', { name: 'Import 2 teams' }));
  expect(await screen.findByText(/Could not verify row 3/)).toBeVisible();
  expect(api.importTeamFromCsv).toHaveBeenCalledTimes(2);
  const [, , identity] = api.importTeamFromCsv.mock.calls[1];

  await fireEvent.click(screen.getByRole('button', { name: 'Import 1 team' }));
  expect(await screen.findByText('0 ready · 2 imported · 1 skipped')).toBeVisible();
  expect(api.importTeamFromCsv).toHaveBeenCalledTimes(3);
  expect(api.importTeamFromCsv).toHaveBeenLastCalledWith('tenant-a', 'Blue Team', identity);
  await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(onClose).toHaveBeenCalledWith(2);
});
