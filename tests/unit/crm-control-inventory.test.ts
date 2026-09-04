import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const crmRoot = join(process.cwd(), 'src/components/crm');
const nativeControls = new Set(['button', 'a', 'input', 'select', 'textarea']);

const reviewedControlCounts: Record<string, number> = {
  'ActivityManager.svelte': 14,
  'CommunicationsManager.svelte': 38,
  'ConsumerAdminInbox.svelte': 10,
  'CrmApp.svelte': 3,
  'CrmBreadcrumbs.svelte': 1,
  'CrmShell.svelte': 20,
  'DataTable.svelte': 12,
  'DocumentsManager.svelte': 14,
  'EventScheduler.svelte': 18,
  'FinancialOperationsWorkspace.svelte': 6,
  'GlobalDashboard.svelte': 10,
  'GlobalSearch.svelte': 5,
  'InviteStaffModal.svelte': 6,
  'Login.svelte': 15,
  'MediaManager.svelte': 28,
  'MyAppStudio.svelte': 4,
  'SettingsManager.svelte': 12,
  'SetupWorkflow.svelte': 11,
  'StaffManager.svelte': 20,
  'TeamsManager.svelte': 14,
  'TenantOperations.svelte': 10,
  'app-studio/BrandingControls.svelte': 7,
  'app-studio/BrandingPanel.svelte': 1,
  'app-studio/ComponentEditor.svelte': 9,
  'app-studio/ComponentLibrary.svelte': 3,
  'app-studio/ComponentLayoutHistory.svelte': 3,
  'app-studio/ComponentOutline.svelte': 4,
  'app-studio/ComponentPublishReview.svelte': 4,
  'app-studio/ComponentThumbnail.svelte': 0,
  'app-studio/ComponentsStudio.svelte': 6,
  'app-studio/NavigationPanel.svelte': 4,
  'app-studio/VersionHistoryPanel.svelte': 2,
  'app-studio/StructuredCollectionEditor.svelte': 7,
  'app/AppPreviewFrame.svelte': 1,
  'app/AppPublishReview.svelte': 4,
  'messages/AnnouncementPublishReview.svelte': 4,
  'billing/BillingPackagesWorkspace.svelte': 21,
  'billing/EventPaymentTermsEditor.svelte': 7,
  'documents/DocumentEditor.svelte': 11,
  'events/CreateEventForm.svelte': 21,
  'events/DuplicateEventModal.svelte': 9,
  'events/EditEventModal.svelte': 12,
  'events/EventBatchPublishReview.svelte': 4,
  'events/EventCsvImport.svelte': 4,
  'events/EventFilters.svelte': 7,
  'events/EventRegistrantsModal.svelte': 2,
  'events/RecurrenceSelector.svelte': 13,
  'registration/CreateRegistrationForm.svelte': 28,
  'registration/FormsTable.svelte': 1,
  'registration/RegistrationDetail.svelte': 12,
  'registration/RegistrationLifecycleReview.svelte': 5,
  'registration/RegistrationManager.svelte': 8,
  'roster/ImportCsv.svelte': 2,
  'roster/ParticipantDetailPanel.svelte': 13,
  'roster/PlayerTable.svelte': 10,
  'roster/RosterManager.svelte': 4,
  'roster/RosterParticipantEntry.svelte': 9,
  'roster/TeamTable.svelte': 5,
  'seasons/CreateSeasonModal.svelte': 7,
  'seasons/EditSeasonModal.svelte': 8,
  'seasons/LinkEventModal.svelte': 7,
  'seasons/SeasonDetail.svelte': 16,
  'seasons/SeasonsManager.svelte': 10,
  'teams/CreateTeamForm.svelte': 4,
  'ui/ChangeReceipt.svelte': 2,
  'ui/DetailDrawer.svelte': 2,
  'ui/EmptyState.svelte': 2,
  'ui/FilterBar.svelte': 2,
  'ui/Icon.svelte': 0,
  'ui/ImageFilePicker.svelte': 2,
  'ui/LoadingState.svelte': 0,
  'ui/PageHeader.svelte': 0,
  'ui/PortalExperienceCatalog.svelte': 5,
  'ui/StatusButton.svelte': 1,
  'ui/StatusNotice.svelte': 1,
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
    expect(Object.values(actual).reduce((sum, count) => sum + count, 0)).toBe(607);
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
