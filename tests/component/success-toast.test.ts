import { act, fireEvent, render, screen } from '@testing-library/svelte';
import type { Component } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SuccessToast from '../../src/components/crm/ui/SuccessToast.svelte';
describe('success notification', () => {
  afterEach(() => vi.useRealTimers());
  it('announces a compact message and dismisses automatically', async () => {
    vi.useFakeTimers(); const dismiss = vi.fn();
    render(SuccessToast as unknown as Component, { title: 'Event created', onDismiss: dismiss });
    expect(screen.getByRole('status')).toHaveTextContent('Event created');
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it('pauses while focused and cleans up the timer when removed', async () => {
    vi.useFakeTimers(); const dismiss = vi.fn();
    const view = render(SuccessToast as unknown as Component, { title: 'Event updated', onDismiss: dismiss });
    await fireEvent.focusIn(screen.getByRole('button', { name: 'Dismiss success notification' }));
    await act(async () => { vi.advanceTimersByTime(6000); }); expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss success notification' })); expect(dismiss).toHaveBeenCalledOnce();
    view.unmount(); await act(async () => { vi.advanceTimersByTime(6000); }); expect(dismiss).toHaveBeenCalledOnce();
  });
});
