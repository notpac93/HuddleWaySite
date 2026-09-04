import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function path(relativePath: string) {
  return fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
}

function source(relativePath: string) {
  return readFileSync(path(relativePath), 'utf8');
}

describe('CRM financial launch scope', () => {
  it('keeps retired legacy billing components out of the website source tree', () => {
    for (const retiredPath of [
      'src/components/crm/Financials.svelte',
      'src/components/crm/FinancialPeriodManager.svelte',
      'src/components/crm/TransactionDetails.svelte',
      'src/lib/finance/crmFinancials.ts',
    ]) {
      expect(existsSync(path(retiredPath)), retiredPath).toBe(false);
    }
  });

  it('routes Financials to the compact authenticated operations workspace', () => {
    const app = source('src/components/crm/CrmApp.svelte');
    const workspace = source('src/components/crm/FinancialOperationsWorkspace.svelte');

    expect(app).toContain("Financials: () => import('./FinancialOperationsWorkspace.svelte')");
    expect(workspace).toContain('backendClient.financialOverview');
    expect(workspace).toContain("import BillingPackagesWorkspace from './billing/BillingPackagesWorkspace.svelte'");
    expect(workspace).not.toMatch(/Financials\.svelte|FinancialPeriodManager|TransactionDetails/);
  });
});
