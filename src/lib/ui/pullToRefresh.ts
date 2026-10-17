import { refreshActiveData } from '../crm/liveRefresh';

/** Touch-only gesture: native scrolling elsewhere, no page reload or lost drafts. */
export function pullToRefresh(node: HTMLElement, enabled = true) {
  let start: { x: number; y: number; target: Element } | null = null;
  let distance = 0;
  let busy = false;
  let disposed = false;
  const indicator = document.createElement('div');
  indicator.className = 'crm-pull-indicator';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.hidden = true;
  node.prepend(indicator);
  const atTop = (target: Element) => {
    for (let el: Element | null = target; el; el = el.parentElement) {
      if (el.scrollTop > 1) return false;
      if (el === node) return true;
    }
    return false;
  };
  const reset = () => { start = null; distance = 0; if (!busy) indicator.hidden = true; };
  const begin = (event: TouchEvent) => {
    reset();
    const target = event.target instanceof Element ? event.target : null;
    if (!enabled || busy || event.touches.length !== 1 || !target || !atTop(target)
      || target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"]')
      || document.querySelector('[aria-modal="true"]')) return;
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY, target };
  };
  const move = (event: TouchEvent) => {
    if (!start) return;
    if (event.touches.length !== 1 || !atTop(start.target)) { reset(); return; }
    const dx = Math.abs(event.touches[0].clientX - start.x);
    const dy = event.touches[0].clientY - start.y;
    if (dy <= 0 || dx > Math.max(12, dy)) { reset(); return; }
    distance = Math.min(dy, 120);
    if (distance < 12) return;
    if (event.cancelable) event.preventDefault();
    indicator.hidden = false;
    indicator.textContent = distance >= 80 ? 'Release to update' : 'Pull to update';
  };
  const finish = async () => {
    const shouldRefresh = distance >= 80;
    start = null; distance = 0;
    if (!shouldRefresh) { reset(); return; }
    busy = true;
    indicator.textContent = 'Updating…';
    try { await refreshActiveData('pull'); }
    finally { busy = false; if (!disposed) indicator.hidden = true; }
  };
  node.addEventListener('touchstart', begin, { passive: true });
  node.addEventListener('touchmove', move, { passive: false });
  node.addEventListener('touchend', finish);
  node.addEventListener('touchcancel', reset);
  return {
    update(value: boolean) { enabled = value; if (!enabled) reset(); },
    destroy() {
      disposed = true;
      node.removeEventListener('touchstart', begin);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', finish);
      node.removeEventListener('touchcancel', reset);
      indicator.remove();
    },
  };
}
