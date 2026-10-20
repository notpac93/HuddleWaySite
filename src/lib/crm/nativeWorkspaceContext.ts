declare global {
  interface Window {
    HuddleWayNative?: { postMessage(message: string): void };
    huddlewayNativeSignIn?: (
      token: string,
      uid: string,
      nonce: string,
    ) => Promise<void>;
    huddlewayNativeReady?: (nonce: string) => void;
    huddlewayNativeBootStatus?: () => {
      contextModuleReady: boolean;
      trustedContext: boolean;
      bridgeAvailable: boolean;
      signInHandlerReady: boolean;
      readyHandlerReady: boolean;
    };
  }
}

export function isTrustedNativeWorkspaceContext() {
  return (
    typeof window !== "undefined" &&
    window.location.origin === "https://huddleway-dev-admin.web.app" &&
    window.location.pathname.startsWith("/admin/") &&
    new URLSearchParams(window.location.search).get("nativeWorkspace") === "1"
  );
}

// Context must not depend on the timing of Android's JavaScript interface.
export const isNativeWorkspace = isTrustedNativeWorkspaceContext();
export function nativeBridgeAvailable() {
  return (
    isTrustedNativeWorkspaceContext() &&
    typeof window.HuddleWayNative?.postMessage === "function"
  );
}

let nativeNonce = "";
export function validNativeWorkspaceNonce(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}
export function matchesNativeWorkspaceNonce(value: string) {
  return !nativeNonce || value === nativeNonce;
}
export function setNativeWorkspaceNonce(value: string) {
  nativeNonce = value;
}

export function notifyNativeWorkspace(
  type: "ready" | "signedIn" | "failed" | "signedOut",
) {
  if (!nativeBridgeAvailable()) return false;
  try {
    window.HuddleWayNative!.postMessage(
      JSON.stringify({ type, nonce: nativeNonce }),
    );
    return true;
  } catch {
    // A present interface can still be initializing. Bounded readiness retries
    // handle that case without exposing platform errors or identity data.
    return false;
  }
}

if (isNativeWorkspace) {
  window.huddlewayNativeBootStatus = () => ({
    contextModuleReady: true,
    trustedContext: isTrustedNativeWorkspaceContext(),
    bridgeAvailable: nativeBridgeAvailable(),
    signInHandlerReady: typeof window.huddlewayNativeSignIn === "function",
    readyHandlerReady: typeof window.huddlewayNativeReady === "function",
  });
}

// Never forward SDK messages, arbitrary provider codes, identities or tokens.
export function notifyNativeAuthorization(diagnostic: {
  state: 'attempt_failed' | 'exhausted' | 'resolved' | 'retry_requested';
  phase?: string; reason?: string; httpStatus?: number; attempt?: number; elapsedMs?: number;
}) {
  if (!nativeBridgeAvailable() || !validNativeWorkspaceNonce(nativeNonce)) return false;
  if (!['attempt_failed', 'exhausted', 'resolved', 'retry_requested'].includes(diagnostic.state)) return false;
  const phases = ['identity_ready', 'identity_token', 'app_check', 'authorization_http', 'authorization_request'];
  const reasons = ['network_error', 'token_expired', 'token_revoked', 'user_disabled', 'fetch_status', 'recaptcha_error', 'throttled', 'not_initialized', 'deadline', 'unauthenticated', 'forbidden', 'http_error', 'unknown'];
  const payload = {
    type: 'authorization', nonce: nativeNonce, state: diagnostic.state,
    ...(phases.includes(diagnostic.phase || '') ? { phase: diagnostic.phase } : {}),
    ...(reasons.includes(diagnostic.reason || '') ? { reason: diagnostic.reason } : {}),
    ...(Number.isInteger(diagnostic.httpStatus) && diagnostic.httpStatus! >= 100 && diagnostic.httpStatus! <= 599 ? { httpStatus: diagnostic.httpStatus } : {}),
    ...(Number.isInteger(diagnostic.attempt) && diagnostic.attempt! >= 1 && diagnostic.attempt! <= 3 ? { attempt: diagnostic.attempt } : {}),
    ...(Number.isInteger(diagnostic.elapsedMs) && diagnostic.elapsedMs! >= 0 && diagnostic.elapsedMs! <= 120000 ? { elapsedMs: diagnostic.elapsedMs } : {}),
  };
  try { window.HuddleWayNative!.postMessage(JSON.stringify(payload)); return true; }
  catch { return false; }
}
