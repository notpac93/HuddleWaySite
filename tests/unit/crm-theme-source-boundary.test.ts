import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../..');
const crmRoot = join(projectRoot, 'src/components/crm');
const crmCss = join(projectRoot, 'src/styles/crm.css');

const semanticUtilityExceptions = new Map<string, {
  reason: string;
  utilities: Set<string>;
}>([
  ['src/components/crm/ActivityManager.svelte', {
    reason: 'blue denotes an update audit event alongside green create and red delete events',
    utilities: new Set(['bg-blue-100', 'text-blue-600']),
  }],
  ['src/components/crm/ConsumerAdminInbox.svelte', {
    reason: 'blue badge identifies an unread conversation state',
    utilities: new Set(['bg-blue-100', 'text-blue-800']),
  }],
  ['src/components/crm/InviteStaffModal.svelte', {
    reason: 'blue panel explains the selected permission scope before invitation',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-950']),
  }],
  ['src/components/crm/MyAppStudio.svelte', {
    reason: 'blue panel identifies an informational rollback draft',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-900']),
  }],
  ['src/components/crm/StaffManager.svelte', {
    reason: 'blue panels and links explain role impact and pending-invite actions',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-950', 'text-blue-700', 'hover:text-blue-900']),
  }],
  ['src/components/crm/GlobalDashboard.svelte', {
    reason: 'blue panel communicates read-only viewer information',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-900']),
  }],
  ['src/components/crm/SettingsManager.svelte', {
    reason: 'cyan panel communicates an informational setup state',
    utilities: new Set(['border-cyan-200', 'bg-cyan-50', 'text-cyan-900']),
  }],
  ['src/components/crm/SetupWorkflow.svelte', {
    reason: 'blue panel communicates an informational setup requirement',
    utilities: new Set(['border-blue-400', 'bg-blue-50', 'text-blue-400', 'text-blue-700']),
  }],
  ['src/components/crm/TenantOperations.svelte', {
    reason: 'blue labels distinguish development from red production environments',
    utilities: new Set(['bg-blue-100', 'text-blue-700', 'text-blue-800']),
  }],
  ['src/components/crm/billing/BillingPackagesWorkspace.svelte', {
    reason: 'blue panel is an informational package configuration notice',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-900']),
  }],
  ['src/components/crm/events/CreateEventForm.svelte', {
    reason: 'blue panel is an informational recurrence notice',
    utilities: new Set(['border-blue-100', 'bg-blue-50', 'text-blue-900']),
  }],
  ['src/components/crm/roster/ImportCsv.svelte', {
    reason: 'blue panel contains informational CSV guidance',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-900', 'text-blue-950']),
  }],
  ['src/components/crm/registration/CreateRegistrationForm.svelte', {
    reason: 'blue panels distinguish edit impact and the family form preview',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-900', 'text-blue-950']),
  }],
  ['src/components/crm/seasons/CreateSeasonModal.svelte', {
    reason: 'blue panel explains the selected season scope',
    utilities: new Set(['border-blue-100', 'bg-blue-50', 'text-blue-900']),
  }],
  ['src/components/crm/seasons/EditSeasonModal.svelte', {
    reason: 'blue panel contains the reviewed season impact summary',
    utilities: new Set(['border-blue-200', 'bg-blue-50', 'text-blue-950']),
  }],
]);

function productionCrmFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory()
      ? productionCrmFiles(path)
      : path.endsWith('.svelte')
        ? [path]
        : [];
  });
}

describe('CRM tenant-theme source boundary', () => {
  it('does not reintroduce legacy brand accents into production CRM sources', () => {
    const legacyAccent = /#(?:00a4bd|1855c5|1a56db|2563eb)\b|\bindigo-(?:500|600|700)\b/gi;
    const violations = [...productionCrmFiles(crmRoot), crmCss].flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return [...source.matchAll(legacyAccent)].map(
        (match) => `${relative(projectRoot, path)}: ${match[0]}`,
      );
    });

    expect(violations).toEqual([]);
  });

  it('keeps theme scope inside CRM sources', () => {
    const globalCss = readFileSync(join(projectRoot, 'src/styles/global.css'), 'utf8');
    expect(globalCss).not.toContain('--crm-brand-primary');
  });

  it('allows blue, teal, cyan, and indigo utilities only for documented semantics', () => {
    const semanticUtility = /\b(?:bg|text|border|ring|outline|from|via|to|hover:bg|hover:text|focus:ring|focus:border)-(?:blue|teal|cyan|indigo)-[0-9]{2,3}(?:\/[0-9]{1,3})?/g;
    const violations = productionCrmFiles(crmRoot).flatMap((path) => {
      const sourcePath = relative(projectRoot, path);
      const exception = semanticUtilityExceptions.get(sourcePath);
      return [...readFileSync(path, 'utf8').matchAll(semanticUtility)]
        .map((match) => match[0])
        .filter((utility) => !exception?.utilities.has(utility))
        .map((utility) => `${sourcePath}: ${utility}`);
    });

    expect(violations).toEqual([]);
    expect([...semanticUtilityExceptions.values()].every(({ reason }) => reason.length > 0))
      .toBe(true);
  });
});
