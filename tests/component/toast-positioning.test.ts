import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../../src/components/crm/ui/toast';
describe('shared notification placement', () => {
  afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
  it('stacks outside page panels, dismisses success and cleans up on navigation', () => {
    vi.useFakeTimers();
    const panel = document.createElement('section'); document.body.append(panel);
    const first = document.createElement('p'); first.textContent = 'Team updated'; first.setAttribute('role','status'); panel.append(first);
    const dismiss = vi.fn(); const action = toast(first, {dismiss});
    const second = document.createElement('p'); second.textContent = 'Season updated'; panel.append(second); const other = toast(second);
    expect(first.parentElement).toBe(second.parentElement);
    expect(first.parentElement?.parentElement).toBe(document.body);
    expect(panel.textContent).toBe('');
    vi.advanceTimersByTime(5000); expect(first.hidden).toBe(true); expect(dismiss).toHaveBeenCalledOnce();
    action.destroy(); other.destroy(); expect(document.querySelector('[data-crm-toast-region]')).toBeNull();
  });
  it('keeps errors and recovery actions available until dismissed', () => {
    vi.useFakeTimers();
    const node = document.createElement('div'); node.setAttribute('role','alert'); node.textContent = 'Try again'; document.body.append(node);
    const action = toast(node); vi.advanceTimersByTime(60000); expect(node.hidden).toBe(false);
    node.querySelector('button')?.click(); expect(node.hidden).toBe(true); action.destroy();
  });
});
