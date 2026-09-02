import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/crm/Financials.svelte', async () => ({
  default: (await import('../fixtures/FinancialsFixture.svelte')).default,
}));
vi.mock('../../src/components/crm/billing/BillingPackagesWorkspace.svelte', async () => ({
  default: (await import('../fixtures/BillingPackagesFixture.svelte')).default,
}));

import FinancialOperationsWorkspace from '../../src/components/crm/FinancialOperationsWorkspace.svelte';

const Tested = FinancialOperationsWorkspace as unknown as Component;

describe('FinancialOperationsWorkspace', () => {
  it('makes the complete financial record workspace and payment setup reachable', async () => {
    render(Tested, { activeTeam: { id: 'team-a', name: '12U Gold' } });

    expect(screen.getByRole('navigation', { name: 'Financial workspace' })).toBeVisible();
    expect(screen.getByText(/Financial records fixture/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Financial records' })).toHaveAttribute('aria-pressed', 'true');

    await fireEvent.click(screen.getByRole('button', { name: 'Payment setup' }));
    expect(screen.getByText('Payment setup fixture')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Payment setup' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/Financial records fixture/)).toBeNull();
  });
});
