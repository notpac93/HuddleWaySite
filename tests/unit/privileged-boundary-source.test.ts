import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));

function source(relativePath: string) {
  return readFileSync(join(sourceRoot, relativePath), 'utf8');
}

const browserWritePattern =
  /\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction|uploadBytes|uploadBytesResumable|deleteObject)\s*\(/;

function sourceFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = join(sourceRoot, relativeDirectory);
  return readdirSync(absoluteDirectory).flatMap((entry) => {
    const absolutePath = join(absoluteDirectory, entry);
    const relativePath = join(relativeDirectory, entry);
    if (statSync(absolutePath).isDirectory()) return sourceFiles(relativePath);
    return /\.(?:svelte|ts)$/.test(entry) ? [relativePath] : [];
  });
}

describe('privileged CRM browser boundary', () => {
  it.each([
    'components/crm/CommunicationsManager.svelte',
    'components/crm/InviteStaffModal.svelte',
    'components/crm/StaffManager.svelte',
    'components/crm/roster/ImportCsv.svelte',
    'components/crm/roster/PlayerTable.svelte',
    'components/crm/ActivityManager.svelte',
  ])('%s does not directly mutate Firestore', (relativePath) => {
    expect(source(relativePath)).not.toMatch(browserWritePattern);
  });

  it('keeps every CRM component and shared service behind server-owned mutation APIs', () => {
    const files = [
      ...sourceFiles('components/crm'),
      ...sourceFiles('lib/services'),
      ...sourceFiles('lib/api'),
    ];
    const violations = files.filter((relativePath) =>
      browserWritePattern.test(source(relativePath)),
    );
    expect(violations).toEqual([]);
  });

  it('loads financial projections through the authenticated backend', () => {
    const dataStoreSource = source('lib/services/DataStore.ts');

    expect(dataStoreSource).toContain('financialOverview');
    expect(dataStoreSource).not.toMatch(
      /collection\(db,\s*['"](?:transactions|refunds|direct_invoices|deposits)['"]\)/,
    );
  });

  it('loads backend-owned roster memberships and audit events through safe projections', () => {
    const rosterServiceSource = source('lib/services/RosterService.ts');
    const activitySource = source('components/crm/ActivityManager.svelte');

    expect(rosterServiceSource).toContain('backendClient.rosterPlayers');
    expect(rosterServiceSource).not.toMatch(
      /collection\(db,\s*['"]team_memberships['"]\)/,
    );
    expect(activitySource).toMatch(
      /backendClient\.(?:auditEvents|auditEventPage)/,
    );
    expect(activitySource).not.toContain('audit_logs');
    expect(activitySource).not.toContain('firebase/firestore');
  });

  it('does not call legacy environment URLs from privileged controls', () => {
    for (const relativePath of ['components/crm/InviteStaffModal.svelte']) {
      const componentSource = source(relativePath);
      expect(componentSource).not.toContain('VITE_API_URL');
      expect(componentSource).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
