import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

describe('CRM financial launch scope', () => {
  it('pins the included one-time invoice and reconciliation workflows', () => {
    const decision = source('docs/CRM_FINANCIAL_LAUNCH_SCOPE.md');
    const details = source('src/components/crm/TransactionDetails.svelte');
    const financials = source('src/components/crm/Financials.svelte');

    expect(decision).toContain('Direct-invoice draft detail');
    expect(decision).toContain('Partial or full processor refunds');
    expect(decision).toContain('Deposit/payout status');
    expect(details).toContain('Record offline payment');
    expect(details).toContain('Refund invoice payment');
    expect(details).toContain('Refund transaction');
    expect(details).toContain('invoice-discount');
    expect(financials).toContain("'Disputes'");
    expect(financials).toContain("'Deposits'");
    expect(financials).toContain("'Reconciliation'");
  });

  it('keeps unshipped recurring, aid, credit, and ACH capabilities explicit', () => {
    const decision = source('docs/CRM_FINANCIAL_LAUNCH_SCOPE.md');
    const financials = source('src/components/crm/Financials.svelte');

    expect(decision).toContain('Configurable invoice installments');
    expect(decision).toContain('Scholarships, financial-aid adjustments');
    expect(decision).toContain('ACH-specific administrator promises');
    expect(decision).toContain('Partial offline payments');
    expect(financials).not.toContain('Launch capability boundary');
    expect(financials).not.toContain('Audited financial period locks');
    expect(financials).not.toContain('Configurable installment schedules');
    expect(financials).not.toMatch(
      /(?:create|save|enable|configure)\s+(?:an?\s+)?(?:installment|credit|scholarship|financial aid)/i,
    );
  });
});
