import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ importTeamFromCsv: vi.fn(), request: vi.fn() }));
vi.mock('../../src/lib/api/backendClient', () => ({ backendClient: api }));
vi.mock('../../src/lib/authStore', async () => ({
  tenantIdStore: (await import('svelte/store')).writable('tenant-a'),
}));

import TeamCsvImport from '../../src/components/crm/teams/TeamCsvImport.svelte';

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

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

it('uploads messy scores, previews event links, and retries an unconfirmed final board', async () => {
  vi.stubGlobal('crypto', webcrypto);
  api.importTeamFromCsv.mockResolvedValue({});
  api.request.mockRejectedValueOnce(new Error('Response lost'));
  api.request.mockImplementation(async (_path, { body }) => ({ board: {
    ...body, id: body.operationId, status: 'final', display: 'bars', importedFromCsv: true, revision: 0,
  } }));
  render(TeamCsvImport as unknown as Component, { props: {
    teams: [{ id: 'blue-bots', name: 'Blue Bots' }],
    events: [{ id: 'bolt-2026', title: 'BOLT 2026' }, { id: 'winter-2026', title: 'Winter Animation Fest' }],
  } });
  const source = readFileSync('tests/fixtures/messy-team-scores.csv', 'utf8');
  const file = new File([source], 'messy-team-scores.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => source });
  await fireEvent.change(screen.getByLabelText('Choose CSV file'), { target: { files: [file] } });
  expect(await screen.findByText('Red Rockets · 1200')).toBeVisible();
  expect(screen.getByText(/Existing team.*BOLT 2026/)).toBeVisible();
  expect(screen.getByText(/Duplicate team result/)).toBeVisible();
  expect(screen.getByText(/Event not found/)).toBeVisible();
  expect(screen.getByText(/Skipped report headings/)).toBeVisible();
  expect(screen.getByText(/Summary row ignored/)).toBeVisible();
  expect(api.request).not.toHaveBeenCalled();
  expect(api.importTeamFromCsv).not.toHaveBeenCalled();
  await fireEvent.change(screen.getByLabelText(/Event match for Winter Fest/), { target: { value: 'winter-2026' } });
  expect(screen.getByText(/4 result groups to publish/)).toBeVisible();
  await fireEvent.click(screen.getByRole('button', { name: 'Import 40 score rows' }));
  expect(await screen.findByText(/Response lost/)).toBeVisible();
  const first = api.request.mock.calls[0];
  await fireEvent.click(screen.getByRole('button', { name: 'Import 40 score rows' }));
  expect(await screen.findByText('0 ready · 40 imported · 5 skipped')).toBeVisible();
  expect(api.request.mock.calls[1]).toEqual(first);
  expect(first[1].body).toMatchObject({ eventId: 'bolt-2026', scores: [0, 1200], division: 'Elementary' });
  expect(api.request.mock.calls.some(([, { body }]) => body.eventId === 'winter-2026')).toBe(true);
  expect(api.request.mock.calls.some(([, { body }]) => body.scores.length === 36)).toBe(true);
  expect(api.importTeamFromCsv).toHaveBeenCalledTimes(39);
});
