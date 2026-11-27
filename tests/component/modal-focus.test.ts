import { fireEvent } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modalFocus } from '../../src/lib/ui/modalFocus';

describe('shared CRM modal keyboard contract', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('focuses inside, wraps Tab, handles Escape updates, and restores the opener', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open dialog';
    document.body.append(opener);
    opener.focus();

    const panel = document.createElement('div');
    panel.tabIndex = -1;
    panel.innerHTML = `
      <button id="first">First action</button>
      <button disabled>Disabled action</button>
      <div aria-hidden="true"><button>Hidden action</button></div>
      <button id="last">Last action</button>
    `;
    document.body.append(panel);

    const first = panel.querySelector<HTMLButtonElement>('#first')!;
    const last = panel.querySelector<HTMLButtonElement>('#last')!;
    const firstEscape = vi.fn();
    const secondEscape = vi.fn();
    const action = modalFocus(panel, {
      onEscape: firstEscape,
      initialFocusSelector: '#last',
    });
    expect(document.activeElement).toBe(last);

    await fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    await fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    action.update({ onEscape: secondEscape });
    await fireEvent.keyDown(last, { key: 'Escape' });
    expect(firstEscape).not.toHaveBeenCalled();
    expect(secondEscape).toHaveBeenCalledTimes(1);

    action.destroy();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps focus on a panel that has no operable descendants', async () => {
    const panel = document.createElement('div');
    panel.tabIndex = -1;
    panel.innerHTML = '<button disabled>Unavailable</button>';
    document.body.append(panel);

    const action = modalFocus(panel, { onEscape: vi.fn() });
    expect(document.activeElement).toBe(panel);
    await fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(panel);
    action.destroy();
  });

  it('lifts a workspace dialog above the themed shell and cleans it up', () => {
    const shell = document.createElement('div');
    shell.className = 'crm-ui-shell-root';
    shell.innerHTML = '<main><button>Open</button><div class="crm-ui-modal-root" role="dialog"><div><input type="checkbox"></div></div></main>';
    document.body.append(shell);
    const opener = shell.querySelector('button')!;
    const dialog = shell.querySelector<HTMLElement>('[role="dialog"]')!;
    opener.focus();

    const action = modalFocus(dialog.firstElementChild as HTMLElement, { onEscape: vi.fn() });
    expect(dialog.parentElement).toBe(shell);
    expect(document.activeElement).toBe(dialog.querySelector('input'));
    action.destroy();

    expect(dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
