import { fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it } from 'vitest';
import Editor from '../../src/components/crm/events/EventRecurrenceEditor.svelte';
describe('simple recurrence editor', () => {
  it('updates from the chosen start and end automatically and allows skipping dates', async () => {
    render(Editor as unknown as Component);
    await fireEvent.input(screen.getByLabelText('Start date'), { target: { value: '2026-03-08' } });
    await fireEvent.input(screen.getByLabelText('End date'), { target: { value: '2026-03-15' } });
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
      const button = screen.getByRole('button', { name: day });
      if (button.getAttribute('aria-pressed') === 'true') await fireEvent.click(button);
    }
    if (screen.getByRole('button', { name: 'Sunday' }).getAttribute('aria-pressed') !== 'true') await fireEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate dates' })).toBeNull();
    await fireEvent.click(screen.getByText(/Review dates/, { selector: 'summary' }));
    await fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });
});
