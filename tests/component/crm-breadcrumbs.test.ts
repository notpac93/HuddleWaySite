import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import CrmBreadcrumbs from '../../src/components/crm/CrmBreadcrumbs.svelte';

const TestedCrmBreadcrumbs = CrmBreadcrumbs as unknown as Component;

describe('CrmBreadcrumbs', () => {
  it('navigates through selectable ancestors and marks the current section', async () => {
    const openOrganization = vi.fn();
    const openTeam = vi.fn();
    render(TestedCrmBreadcrumbs, {
      items: [
        { label: 'Organization', onSelect: openOrganization },
        { label: 'Boys', onSelect: openTeam },
        { label: 'Financials', current: true },
      ],
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Organization' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Boys' }));

    expect(openOrganization).toHaveBeenCalledTimes(1);
    expect(openTeam).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Financials')).toHaveAttribute('aria-current', 'page');
  });
});
