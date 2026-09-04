import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const crmRoot = join(process.cwd(), 'src/components/crm');
const source = (relativePath: string) =>
  readFileSync(join(crmRoot, relativePath), 'utf8');

const nativeTableCounts: Record<string, number> = {
  'DataTable.svelte': 1,
  'FinancialOperationsWorkspace.svelte': 1,
  'StaffManager.svelte': 1,
  'registration/RegistrationDetail.svelte': 2,
  'seasons/SeasonDetail.svelte': 2,
  'seasons/SeasonsManager.svelte': 1,
};

describe('exhaustive CRM table and projection audit', () => {
  it('pins every native table and every shared table consumer', () => {
    for (const [file, count] of Object.entries(nativeTableCounts)) {
      expect(source(file).match(/<table\b/g)).toHaveLength(count);
    }
    expect(Object.values(nativeTableCounts).reduce((sum, count) => sum + count, 0))
      .toBe(8);

    for (const file of [
      'events/EventRegistrantsModal.svelte',
      'registration/FormsTable.svelte',
      'roster/PlayerTable.svelte',
    ]) {
      expect(source(file)).toContain('<DataTable');
    }
  });

  it('keeps shared table identity, state, pagination, selection, and export scope fail closed', () => {
    const table = source('DataTable.svelte');
    for (const contract of [
      'rowIdentityError',
      'missing or duplicated',
      'permissionDenied',
      'effectiveError',
      'truncated',
      'filteredAndSortedData',
      'currentPageIds',
      'selectedRows.has(stableId(row))',
      'escapeFormulae: true',
      'Table pagination',
      'md:hidden',
    ]) {
      expect(table).toContain(contract);
    }
  });

  it('uses stable record IDs for every selectable or actionable direct-table row', () => {
    expect(source('FinancialOperationsWorkspace.svelte')).toContain(
      '{#each filteredRows as row (rowKey(row))}',
    );
    expect(source('StaffManager.svelte')).toContain(
      '{#each staffRows as staff (staff.membershipId)}',
    );
    expect(source('StaffManager.svelte')).toContain(
      '{#each inviteRows as invite (invite.id)}',
    );
    expect(source('registration/RegistrationDetail.svelte')).toContain(
      '{#each connectedEvents as evt (evt.id)}',
    );
    expect(source('registration/RegistrationDetail.svelte')).toContain(
      '{#each paginatedParticipants as p (p.id)}',
    );
    expect(source('seasons/SeasonDetail.svelte')).toContain(
      '{#each filteredParticipants as p (p.id)}',
    );
    expect(source('seasons/SeasonDetail.svelte')).toContain(
      '{#each seasonEvents as event (event.id)}',
    );
    expect(source('seasons/SeasonsManager.svelte')).toContain(
      '{#each filteredSeasons as season (season.id)}',
    );
  });

  it('names every horizontally scrollable direct-table region for keyboard users', () => {
    for (const file of Object.keys(nativeTableCounts).filter(
      (candidate) => candidate !== 'DataTable.svelte',
    )) {
      const component = source(file);
      expect(component.match(/<table\b/g)?.length).toBe(
        component.match(/role="region"[^>]*tabindex="0"[^>]*aria-label=/g)
          ?.length,
      );
    }
  });

  it('pins complete operational projections and refuses incomplete financial claims', () => {
    const dataStore = readFileSync(
      join(process.cwd(), 'src/lib/services/DataStore.ts'),
      'utf8',
    );
    expect(dataStore).not.toMatch(/COLLECTION_PROJECTION_LIMIT|queryLimit\(/);
    expect(dataStore).toContain('backendClient.crmOperationalPage');

    for (const file of [
      'GlobalDashboard.svelte',
      'GlobalSearch.svelte',
      'registration/RegistrationDetail.svelte',
      'seasons/SeasonDetail.svelte',
      'seasons/SeasonsManager.svelte',
    ]) {
      expect(source(file)).toMatch(/truncat|ProjectionScope/i);
    }
    expect(source('FinancialOperationsWorkspace.svelte')).toContain('operations.complete');
    expect(source('seasons/SeasonDetail.svelte')).toContain(
      'participantExportUnavailable',
    );
  });
});
