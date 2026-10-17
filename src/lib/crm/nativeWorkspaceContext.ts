declare global {
  interface Window {
    HuddleWayNative?: { postMessage(message: string): void };
    huddlewayNativeSignIn?: (token: string, uid: string, nonce: string) => Promise<void>;
  }
}

export const isNativeWorkspace = typeof window !== 'undefined'
  && window.location.origin === 'https://huddleway-dev-admin.web.app'
  && new URLSearchParams(window.location.search).get('nativeWorkspace') === '1'
  && !!window.HuddleWayNative;

let nativeNonce = '';
export function setNativeWorkspaceNonce(value: string) { nativeNonce = value; }

export function notifyNativeWorkspace(type: string) {
  if (isNativeWorkspace) window.HuddleWayNative?.postMessage(JSON.stringify({ type, nonce: nativeNonce }));
}

