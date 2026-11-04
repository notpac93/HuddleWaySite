import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CompactMessageComposer from '../../src/components/crm/messages/CompactMessageComposer.svelte';

afterEach(cleanup);

describe('compact message composer recipients', () => {
  it('selects a person, closes the picker, and removes the recipient chip', async () => {
    render(CompactMessageComposer, { contacts: [{ email: 'mia@example.test', name: 'Mia Johnson' }] });
    await fireEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Mia Johnson mia@example.test' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByText('1 recipient')).toBeVisible();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Mia Johnson' }));
    expect(screen.queryByText('1 recipient')).not.toBeInTheDocument();
  });

  it('merges a group with existing recipients without duplicates', async () => {
    render(CompactMessageComposer, { recipients: 'mia@example.test', groups: [{ id: 'team', label: 'Warriors', emails: ['mia@example.test', 'alex@example.test'] }] });
    await fireEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
    await fireEvent.change(screen.getByRole('combobox', { name: 'Recipient group' }), { target: { value: 'team' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByLabelText('Recipient emails')).toHaveValue('mia@example.test\nalex@example.test');
    expect(screen.getByText('2 recipients')).toBeVisible();
  });

});
