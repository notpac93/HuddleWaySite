import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendMocks = vi.hoisted(() => ({
  previewRosterChanges: vi.fn(),
  commitRosterChanges: vi.fn(),
}));

const papaMocks = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock('papaparse', () => ({
  default: {
    parse: papaMocks.parse,
  },
}));

vi.mock('../../src/lib/authStore', async () => {
  const { writable } = await import('svelte/store');
  return {
    tenantIdStore: writable('tenant-a'),
  };
});

vi.mock('../../src/lib/api/backendClient', () => ({
  backendClient: backendMocks,
}));

import { tenantIdStore } from '../../src/lib/authStore';
import { BackendApiError } from '../../src/lib/api/BackendApi';
import ImportCsv from '../../src/components/crm/roster/ImportCsv.svelte';

const TestedImportCsv = ImportCsv as unknown as Component;
const tenants = tenantIdStore as Writable<string | null>;

const reviewedPreview = {
  teamId: 'team-1',
  changes: [
    { registrationId: 'registration-1', action: 'add' as const },
    { registrationId: 'registration-2', action: 'remove' as const },
  ],
  rows: [
    { registrationId: 'registration-1', noOp: false },
    { registrationId: 'registration-2', noOp: false },
  ],
  changeSetHash: 'a'.repeat(64),
  addCount: 1,
  removeCount: 1,
  noOpCount: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function chooseTeamAndFile(fileName = 'roster.csv') {
  await fireEvent.change(screen.getByLabelText('Destination team'), {
    target: { value: 'team-1' },
  });
  const fileInput = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File(
    ['Registration ID,Action\nregistration-1,add'],
    fileName,
    { type: 'text/csv' },
  );
  await fireEvent.change(fileInput, {
    target: { files: [file] },
  });
  return fileInput;
}

describe('ImportCsv reviewed roster operation', () => {
  beforeEach(() => {
    backendMocks.previewRosterChanges.mockReset();
    backendMocks.commitRosterChanges.mockReset();
    papaMocks.parse.mockReset();
    tenants.set('tenant-a');
  });

  it('previews and commits the exact reviewed changes once', async () => {
    papaMocks.parse.mockImplementation(
      (
        _file: File,
        options: {
          complete: (result: { data: unknown[] }) => unknown;
        },
      ) => {
        void options.complete({
          data: [
            { 'Registration ID': ' registration-1 ', Action: 'ADD' },
            { registration_id: 'registration-2', action: 'remove' },
          ],
        });
      },
    );
    backendMocks.previewRosterChanges.mockResolvedValue(reviewedPreview);
    const pendingCommit = deferred<{
      success: boolean;
      operationId: string;
      preview: typeof reviewedPreview;
      requestId: string;
    }>();
    backendMocks.commitRosterChanges.mockReturnValue(pendingCommit.promise);

    render(TestedImportCsv, {
      teams: [{ id: 'team-1', name: 'Falcons' }],
    });
    await chooseTeamAndFile();

    const review = screen.getByRole('button', { name: 'Review Changes' });
    await fireEvent.click(review);
    await fireEvent.click(review);

    expect(backendMocks.previewRosterChanges).toHaveBeenCalledTimes(1);
    expect(backendMocks.previewRosterChanges).toHaveBeenCalledWith(
      'tenant-a',
      'team-1',
      reviewedPreview.changes,
    );
    expect(await screen.findByText('Server preview ready')).toBeVisible();

    const apply = screen.getByRole('button', {
      name: 'Apply Reviewed Changes',
    });
    await fireEvent.click(apply);
    await fireEvent.click(apply);
    expect(backendMocks.commitRosterChanges).toHaveBeenCalledTimes(1);
    expect(backendMocks.commitRosterChanges).toHaveBeenCalledWith(
      'tenant-a',
      'team-1',
      reviewedPreview,
      expect.stringContaining('roster-team-1:'),
    );
    expect(screen.getByRole('button', { name: 'Applying...' })).toBeDisabled();
    expect(screen.getByLabelText('Destination team')).toBeDisabled();
    expect(document.querySelector('input[type="file"]')).toBeDisabled();

    pendingCommit.resolve({
      success: true,
      operationId: 'roster-operation-1',
      preview: reviewedPreview,
      requestId: 'roster-commit-request',
    });
    expect(
      await screen.findByText(
        'Roster updated: 1 added, 1 removed, 0 unchanged.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Server preview ready')).toBeNull();
    expect(screen.getByText('Choose a CSV file to continue.')).toBeVisible();
  });

  it('rejects invalid CSV rows locally and resets the error for a new file', async () => {
    papaMocks.parse.mockImplementation(
      (
        _file: File,
        options: {
          complete: (result: { data: unknown[] }) => unknown;
        },
      ) => {
        void options.complete({
          data: [
            { 'Registration ID': '', Action: 'replace' },
            { registrationId: 'registration-2', action: 'add' },
          ],
        });
      },
    );

    render(TestedImportCsv, {
      teams: [{ id: 'team-1', name: 'Falcons' }],
    });
    await chooseTeamAndFile();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Review Changes' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Rows 2 need a Registration ID and add/remove action.',
    );
    expect(
      screen.getByRole('button', { name: 'Retry Review' }),
    ).toBeEnabled();
    expect(backendMocks.previewRosterChanges).not.toHaveBeenCalled();

    await chooseTeamAndFile('corrected.csv');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Review Changes' }),
    ).toBeEnabled();
  });

  it('masks commit failures, exposes correlation, and reuses the reviewed key', async () => {
    papaMocks.parse.mockImplementation(
      (
        _file: File,
        options: {
          complete: (result: { data: unknown[] }) => unknown;
        },
      ) => {
        void options.complete({
          data: [{ registrationId: 'registration-1', action: 'add' }],
        });
      },
    );
    backendMocks.previewRosterChanges.mockResolvedValue(reviewedPreview);
    backendMocks.commitRosterChanges
      .mockRejectedValueOnce(
        new BackendApiError({
          message: 'raw route detail',
          status: 503,
          code: 'roster_commit_failed',
          requestId: 'request-roster-9',
        }),
      )
      .mockResolvedValueOnce({
        success: true,
        operationId: 'roster-operation-1',
        preview: reviewedPreview,
        requestId: 'roster-commit-request',
      });

    render(TestedImportCsv, {
      teams: [{ id: 'team-1', name: 'Falcons' }],
    });
    await chooseTeamAndFile();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Review Changes' }),
    );
    await screen.findByText('Server preview ready');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Apply Reviewed Changes' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The reviewed roster changes could not be applied.',
    );
    expect(alert).toHaveTextContent('Support request: request-roster-9');
    expect(alert).not.toHaveTextContent('raw route detail');

    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry Apply' }),
    );
    await screen.findByText(
      'Roster updated: 1 added, 1 removed, 0 unchanged.',
    );
    expect(backendMocks.commitRosterChanges).toHaveBeenCalledTimes(2);
    expect(
      backendMocks.commitRosterChanges.mock.calls[1][3],
    ).toBe(backendMocks.commitRosterChanges.mock.calls[0][3]);
  });

  it('does not expose a preview that resolves after the tenant changes', async () => {
    papaMocks.parse.mockImplementation(
      (
        _file: File,
        options: {
          complete: (result: { data: unknown[] }) => unknown;
        },
      ) => {
        void options.complete({
          data: [{ registrationId: 'registration-1', action: 'add' }],
        });
      },
    );
    const pendingPreview = deferred<typeof reviewedPreview>();
    backendMocks.previewRosterChanges.mockReturnValue(pendingPreview.promise);

    render(TestedImportCsv, {
      teams: [{ id: 'team-1', name: 'Falcons' }],
    });
    await chooseTeamAndFile();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Review Changes' }),
    );

    await act(async () => {
      tenants.set('tenant-b');
      pendingPreview.resolve(reviewedPreview);
      await pendingPreview.promise;
    });
    await waitFor(() => {
      expect(screen.queryByText('Server preview ready')).toBeNull();
      expect(
        backendMocks.commitRosterChanges,
      ).not.toHaveBeenCalled();
    });
  });
});
