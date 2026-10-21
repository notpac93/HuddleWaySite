import { nativeBridgeAvailable, validNativeWorkspaceNonce } from './nativeWorkspaceContext';

type Session = { uid: string; tenantId: string; nonce: string; epoch: number; nextSequence: number };
type Pending = { readonly deadline: number; sequence: number; session: Session; readUid: () => string | undefined; resolve: (token: string) => void; reject: () => void; timer: ReturnType<typeof setTimeout> };
let session: Session | undefined;
let epoch = 0;
let advertised = false;
const pending = new Map<string, Pending>();
const unavailable = () => new Error('Native App Check unavailable.');
const mainFrame = () => typeof window !== 'undefined' && window.top === window && nativeBridgeAvailable();
const same = (value: Session) => mainFrame() && session === value;
function fresh(id: string, value: Pending) {
  // Timers may be suspended; a late queued native script still cannot deliver.
  if (performance.now() >= value.deadline) {
    pending.delete(id); clearTimeout(value.timer); value.reject(); return false;
  }
  return same(value.session) && value.readUid() === value.session.uid;
}

export function clearNativeAttestation() {
  session = undefined;
  epoch++;
  for (const value of pending.values()) { clearTimeout(value.timer); value.reject(); }
  pending.clear();
}

// Called only from the challenged native custom-token handoff, before sign-in.
export function beginNativeAttestation(uid: string, nonce: string, capability: unknown) {
  clearNativeAttestation();
  if (capability === undefined) return; // Existing clients retain the web provider.
  const value = capability as Record<string, unknown>;
  if (!mainFrame() || !value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'appCheckProtocol,tenantId' ||
      value.appCheckProtocol !== 1 || typeof value.tenantId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value.tenantId) ||
      typeof uid !== 'string' || !uid || uid.length > 128 || !validNativeWorkspaceNonce(nonce)) throw unavailable();
  advertised = true;
  session = { uid, nonce, tenantId: value.tenantId, epoch, nextSequence: 0 };
  window.huddlewayNativeAppCheckContext = (id) => {
    const entry = pending.get(id);
    if (!entry || !fresh(id, entry)) return null;
    return { version: 1, requestId: id, sequence: entry.sequence, uid: entry.session.uid, tenantId: entry.session.tenantId,
      nonce: entry.session.nonce, mainFrame: true, trusted: true, bridgeAvailable: true };
  };
  window.huddlewayNativeAppCheckResponse = (raw) => {
    if (!raw || typeof raw !== 'object') return false;
    const value = raw as Record<string, unknown>;
    if (typeof value.requestId !== 'string') return false;
    const entry = pending.get(value.requestId);
    if (!entry) return false;
    const keys = Object.keys(value).sort().join(',');
    if (!['nonce,requestId,sequence,tenantId,token,uid,version', 'error,nonce,requestId,sequence,tenantId,uid,version'].includes(keys) ||
        value.version !== 1 || value.sequence !== entry.sequence || !fresh(value.requestId, entry) ||
        value.uid !== entry.session.uid || value.tenantId !== entry.session.tenantId || value.nonce !== entry.session.nonce) return false;
    if ('error' in value && value.error !== 'unavailable') return false;
    // Consume before resolving: a duplicate reply cannot publish another token.
    pending.delete(value.requestId); clearTimeout(entry.timer);
    if (typeof value.token === 'string' && value.token.length > 0 && value.token.length <= 16384 && !/\s/.test(value.token)) entry.resolve(value.token);
    else entry.reject();
    return true;
  };
  window.addEventListener('pagehide', clearNativeAttestation, { once: true });
}

export function nativeAttestationAdvertised() { return advertised; }
export function requestNativeAppCheck(forceRefresh: boolean, readUid: () => string | undefined): Promise<string> {
  const current = session;
  if (!current || !same(current) || readUid() !== current.uid || pending.size >= 16) return Promise.reject(unavailable());
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  if (pending.has(id)) return Promise.reject(unavailable());
  const sequence = ++current.nextSequence;
  if (!Number.isSafeInteger(sequence)) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    const fail = () => reject(unavailable());
    const deadline = performance.now() + 15_000;
    const timer = setTimeout(() => { pending.delete(id); fail(); }, 15_000);
    pending.set(id, { deadline, sequence, session: current, readUid, resolve, reject: fail, timer });
    try { window.HuddleWayNative!.postMessage(JSON.stringify({ type: 'appCheckToken', version: 1,
      requestId: id, sequence, uid: current.uid, tenantId: current.tenantId, nonce: current.nonce, forceRefresh })); }
    catch { pending.delete(id); clearTimeout(timer); fail(); }
  });
}
