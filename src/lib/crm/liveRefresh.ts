/** Mounted data sources opt in; refresh never remounts pages or resets editor state. */
export type RefreshReason = 'automatic' | 'pull';
type Source = { run: () => void | Promise<unknown>; pending?: Promise<unknown> };
const sources = new Set<Source>();

export function registerLiveRefresh(run: Source['run']) {
  const source: Source = { run };
  sources.add(source);
  return () => { sources.delete(source); };
}

export async function refreshActiveData(reason: RefreshReason = 'automatic') {
  if (typeof document === 'undefined' || document.visibilityState === 'hidden'
    || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  // Do not disturb an in-progress form or a modal's selected record.
  if (document.querySelector('[aria-modal="true"]')
    || (reason === 'automatic' && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'))) return;
  await Promise.allSettled([...sources].map(source => {
    if (!source.pending) {
      source.pending = Promise.resolve().then(() => sources.has(source) ? source.run() : undefined).finally(() => { source.pending = undefined; });
    }
    return source.pending;
  }));
}

export function startLiveRefresh() {
  let lastWake = Number.NEGATIVE_INFINITY;
  const wake = () => {
    if (document.visibilityState === 'hidden' || Date.now() - lastWake < 5000) return;
    lastWake = Date.now();
    void refreshActiveData();
  };
  const timer = window.setInterval(wake, 60_000);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('focus', wake);
    window.removeEventListener('online', wake);
    document.removeEventListener('visibilitychange', wake);
  };
}
