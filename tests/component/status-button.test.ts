import { act, fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { describe, expect, it } from 'vitest';
import StatusButton from '../../src/components/crm/ui/StatusButton.svelte';
import StatusButtonHarness from '../fixtures/StatusButtonHarness.svelte';

// Astro augments imported Svelte component props with client directives.
// Testing Library expects Svelte's runtime Component type at this test boundary.
const TestedStatusButton = StatusButton as unknown as Component;
const TestedStatusButtonHarness = StatusButtonHarness as unknown as Component;

describe('StatusButton', () => {
  it('renders deterministic idle, loading, success, and error states', async () => {
    const view = render(TestedStatusButton, {
      state: 'idle',
      idleText: 'Save',
      loadingText: 'Saving',
      successText: 'Saved',
      errorText: 'Try again',
    });

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await view.rerender({ state: 'loading' });
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled();

    await view.rerender({ state: 'success' });
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled();

    await view.rerender({ state: 'error' });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('forwards clicks only while actionable', async () => {
    const view = render(TestedStatusButtonHarness, { state: 'idle' });
    const clickCount = screen.getByRole('status', { name: 'click count' });

    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(clickCount).toHaveTextContent('1');

    await view.rerender({ state: 'loading' });
    const disabledButton = screen.getByRole('button', { name: 'Saving' });
    await act(() => disabledButton.click());
    expect(clickCount).toHaveTextContent('1');
  });
});
