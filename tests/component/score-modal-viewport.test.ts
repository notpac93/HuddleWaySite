import { afterEach, describe, expect, it, vi } from 'vitest';
import { scoreModalViewport } from '../../src/lib/ui/scoreModalViewport';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('score dialog keyboard viewport', () => {
  it('follows keyboard resizing and panning without replacing the focused input', () => {
    const viewport = Object.assign(new EventTarget(), { height: 740, offsetTop: 0 });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('visualViewport', viewport);
    const overlay = document.createElement('div'), input = document.createElement('input');
    overlay.append(input); document.body.append(overlay);
    input.value = 'Sharks'; input.focus(); input.setSelectionRange(2, 2);
    const action = scoreModalViewport(overlay);
    viewport.height = 350; viewport.offsetTop = 92;
    viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'));
    expect(overlay.style.getPropertyValue('--score-modal-height')).toBe('350px');
    expect(overlay.style.getPropertyValue('--score-modal-top')).toBe('92px');
    expect(document.activeElement).toBe(input); expect(input.selectionStart).toBe(2);
    action.destroy(); viewport.height = 600; viewport.dispatchEvent(new Event('resize'));
    expect(overlay.style.getPropertyValue('--score-modal-height')).toBe('350px');
    overlay.remove();
  });
});
