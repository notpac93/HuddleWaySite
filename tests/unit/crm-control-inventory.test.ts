import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const crmRoot = join(process.cwd(), 'src/components/crm');
const nativeControls = new Set(['button', 'a', 'input', 'select', 'textarea']);

const reviewedControlCounts: Record<string, number> = {
  'ActivityManager.svelte': 3,
  'CommunicationsManager.svelte': 11,
  'CrmApp.svelte': 1,
  'CrmBreadcrumbs.svelte': 1,
  'CrmShell.svelte': 14,
  'DataTable.svelte': 9,
  'DocumentsManager.svelte': 7,
  'EventScheduler.svelte': 18,
  'FinancialPeriodManager.svelte': 14,
  'Financials.svelte': 30,
  'GlobalDashboard.svelte': 2,
  'GlobalSearch.svelte': 5,
  'InviteStaffModal.svelte': 6,
  'Login.svelte': 13,
  'MediaManager.svelte': 2,
  'MyAppStudio.svelte': 10,
  'SettingsManager.svelte': 6,
  'SetupWorkflow.svelte': 11,
  'StaffManager.svelte': 14,
  'TeamsManager.svelte': 7,
  'TenantOperations.svelte': 10,
  'TransactionDetails.svelte': 36,
  'events/CreateEventForm.svelte': 18,
  'events/DuplicateEventModal.svelte': 9,
  'events/EditEventModal.svelte': 12,
  'events/EventRegistrantsModal.svelte': 2,
  'events/RecurrenceSelector.svelte': 13,
  'registration/CreateRegistrationForm.svelte': 21,
  'registration/FormsTable.svelte': 1,
  'registration/RegistrationDetail.svelte': 10,
  'registration/RegistrationManager.svelte': 7,
  'roster/ImportCsv.svelte': 2,
  'roster/PlayerTable.svelte': 5,
  'roster/RosterManager.svelte': 4,
  'roster/RosterParticipantEntry.svelte': 9,
  'roster/TeamTable.svelte': 5,
  'seasons/CreateSeasonModal.svelte': 6,
  'seasons/EditSeasonModal.svelte': 8,
  'seasons/LinkEventModal.svelte': 5,
  'seasons/SeasonDetail.svelte': 13,
  'seasons/SeasonsManager.svelte': 8,
  'teams/CreateTeamForm.svelte': 4,
  'ui/ImageFilePicker.svelte': 1,
  'ui/StatusButton.svelte': 1,
};

function componentFiles(directory = crmRoot): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const absolute = join(directory, entry);
      return statSync(absolute).isDirectory()
        ? componentFiles(absolute)
        : absolute.endsWith('.svelte')
          ? [absolute]
          : [];
    })
    .sort();
}

function walk(node: unknown, visit: (candidate: any) => void) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object' && value !== node) walk(value, visit);
  }
}

function inspectControls(source: string) {
  const parsed = parse(source);
  const controls: any[] = [];
  walk(parsed.html, (node) => {
    if (node.type === 'Element' && nativeControls.has(node.name)) controls.push(node);
  });
  return controls;
}

function hasRealDisposition(control: any) {
  return control.attributes.some((attribute: any) =>
    attribute.type === 'EventHandler'
    || attribute.type === 'Binding'
    || (
      attribute.type === 'Attribute'
      && ['href', 'disabled', 'readonly'].includes(attribute.name)
    ),
  );
}

function localSvelteImports(file: string) {
  const source = readFileSync(file, 'utf8');
  const imports = [
    ...source.matchAll(
      /(?:from\s*|import\s*\()\s*['"]([^'"]+\.svelte)['"]/g,
    ),
  ];
  return imports
    .map((match) => resolve(dirname(file), match[1]))
    .filter((candidate) => candidate.startsWith(crmRoot) && existsSync(candidate));
}

describe('exhaustive CRM control inventory', () => {
  it('keeps every canonical Svelte component in the reviewed inventory', () => {
    const actual = Object.fromEntries(
      componentFiles().map((file) => {
        const source = readFileSync(file, 'utf8');
        return [relative(crmRoot, file), inspectControls(source).length];
      }),
    );

    expect(actual).toEqual(reviewedControlCounts);
    expect(Object.values(actual).reduce((sum, count) => sum + count, 0)).toBe(394);
  });

  it('keeps every inventoried CRM component reachable from a production entry point', () => {
    const roots = [
      join(crmRoot, 'CrmApp.svelte'),
      join(crmRoot, 'SetupWorkflow.svelte'),
    ];
    const reachable = new Set<string>();
    const pending = [...roots];
    while (pending.length > 0) {
      const file = pending.pop()!;
      if (reachable.has(file)) continue;
      reachable.add(file);
      pending.push(...localSvelteImports(file));
    }

    const orphaned = componentFiles()
      .filter((file) => !reachable.has(file))
      .map((file) => relative(crmRoot, file));
    expect(orphaned).toEqual([]);
  });

  it('does not expose a native control without a handler, binding, link, or explicit disabled/read-only disposition', () => {
    const failures = componentFiles().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return inspectControls(source)
        .filter((control) => !hasRealDisposition(control))
        .map((control) => ({
          file: relative(crmRoot, file),
          line: source.slice(0, control.start).split('\n').length,
          tag: control.name,
        }));
    });

    expect(failures).toEqual([]);
  });

  it('rejects known placeholder and no-op UI language throughout the component tree', () => {
    const forbidden = [
      /href\s*=\s*["']#["']/i,
      /coming soon/i,
      /functionality would/i,
      /sample action button/i,
      /show teams report/i,
      /manage columns/i,
      /manage packages/i,
      /need help\?/i,
      /actions\s*▾/i,
      />\s*25 per page\s*</i,
    ];
    const failures = componentFiles().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(crmRoot, file)}: ${pattern}`);
    });

    expect(failures).toEqual([]);
  });
});
