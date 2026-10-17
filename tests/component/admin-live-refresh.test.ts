import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerLiveRefresh, refreshActiveData, startLiveRefresh } from '../../src/lib/crm/liveRefresh';
import { pullToRefresh } from '../../src/lib/ui/pullToRefresh';

const disposers: Array<() => void> = [];
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => { disposers.splice(0).forEach(stop => stop()); document.body.innerHTML = ''; vi.useRealTimers(); });

function source(run = vi.fn().mockResolvedValue(undefined)) {
  disposers.push(registerLiveRefresh(run));
  return run;
}
function touch(node: HTMLElement, type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }] });
  node.dispatchEvent(event);
}

describe('mounted Admin live data', () => {
  it('coalesces overlapping requests and unregisters departed sources', async () => {
    let finish!: () => void;
    const run = source(vi.fn(() => new Promise<void>(resolve => { finish = resolve; })));
    const first = refreshActiveData();
    const second = refreshActiveData('pull');
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    finish(); await Promise.all([first, second]);
    disposers.pop()!();
    await refreshActiveData(); expect(run).toHaveBeenCalledTimes(1);
  });
  it('pauses offline, hidden, focused forms and modal editing', async () => {
    const run = source();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await refreshActiveData();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await refreshActiveData();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    document.body.innerHTML = '<input value="unsaved" />';
    document.querySelector('input')!.focus(); await refreshActiveData();
    document.body.innerHTML = '<div aria-modal="true"></div>';
    await refreshActiveData('pull'); expect(run).not.toHaveBeenCalled();
    document.body.innerHTML = ''; await refreshActiveData(); expect(run).toHaveBeenCalledTimes(1);
  });
  it('updates each minute and on return/reconnection, then cleans up', async () => {
    vi.useFakeTimers();
    const run = source(); const stop = startLiveRefresh(); disposers.push(stop);
    await vi.advanceTimersByTimeAsync(60_000); expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5001);
    window.dispatchEvent(new Event('focus')); await Promise.resolve(); expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5001);
    window.dispatchEvent(new Event('online')); await Promise.resolve(); expect(run).toHaveBeenCalledTimes(3);
    stop(); await vi.advanceTimersByTimeAsync(60_000); expect(run).toHaveBeenCalledTimes(3);
  });
  it('pulls only at the top, ignores horizontal drags, and cleans up', async () => {
    const run = source();
    const root = document.createElement('main'); const content = document.createElement('div');
    root.append(content); document.body.append(root);
    const gesture = pullToRefresh(root); disposers.push(() => gesture.destroy());
    content.scrollTop = 100;
    touch(content, 'touchstart', 0, 0); touch(content, 'touchmove', 0, 100); touch(content, 'touchend', 0, 100);
    await Promise.resolve(); expect(run).not.toHaveBeenCalled();
    content.scrollTop = 0;
    touch(content, 'touchstart', 0, 0); touch(content, 'touchmove', 100, 20); touch(content, 'touchend', 100, 20);
    await Promise.resolve(); expect(run).not.toHaveBeenCalled();
    touch(content, 'touchstart', 0, 0); touch(content, 'touchmove', 0, 100);
    expect(root.textContent).toContain('Release to update');
    touch(content, 'touchend', 0, 100); await refreshActiveData('pull');
    expect(run).toHaveBeenCalledTimes(1);
    gesture.update(false);
    touch(content, 'touchstart', 0, 0); touch(content, 'touchmove', 0, 100); touch(content, 'touchend', 0, 100);
    await Promise.resolve(); expect(run).toHaveBeenCalledTimes(1);
  });
});
