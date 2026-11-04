/** Refresh mounted form libraries after a successful tenant-scoped save. */
const listeners = new Map<string, Set<() => void>>();
export function registerRegistrationFormRefresh(tenantId: string, refresh: () => void) {
  const scoped = listeners.get(tenantId) || new Set();
  scoped.add(refresh); listeners.set(tenantId, scoped);
  return () => { scoped.delete(refresh); if (!scoped.size) listeners.delete(tenantId); };
}
export function notifyRegistrationFormsChanged(tenantId: string) {
  for (const refresh of listeners.get(tenantId) || []) refresh();
}
