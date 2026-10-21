import { beginNativeAttestation, clearNativeAttestation } from "./nativeWorkspaceAttestation";
import { writable } from "svelte/store";
import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  isNativeWorkspace,
  isTrustedNativeWorkspaceContext,
  matchesNativeWorkspaceNonce,
  notifyNativeWorkspace,
  setNativeWorkspaceNonce,
  validNativeWorkspaceNonce,
} from "./nativeWorkspaceContext";

export { isNativeWorkspace, notifyNativeWorkspace };
export const nativeWorkspacePending = writable(isNativeWorkspace);

if (isNativeWorkspace) {
  let signingIn = false;
  let readyInterval: ReturnType<typeof setInterval> | undefined;
  let readyDeadline: ReturnType<typeof setTimeout> | undefined;
  function stopReadyAnnouncements() {
    clearInterval(readyInterval);
    clearTimeout(readyDeadline);
  }

  // The native main frame challenges this page with its current load nonce.
  // An unsolicited ready is only an invitation to issue that challenge.
  window.huddlewayNativeReady = (nonce) => {
    if (
      signingIn ||
      !isTrustedNativeWorkspaceContext() ||
      !validNativeWorkspaceNonce(nonce)
    )
      return;
    setNativeWorkspaceNonce(nonce);
    notifyNativeWorkspace("ready");
  };
  window.huddlewayNativeSignIn = async (token, uid, nonce, capability) => {
    if (
      signingIn ||
      !isTrustedNativeWorkspaceContext() ||
      !validNativeWorkspaceNonce(nonce) ||
      !matchesNativeWorkspaceNonce(nonce)
    )
      return;
    signingIn = true;
    stopReadyAnnouncements();
    setNativeWorkspaceNonce(nonce);
    nativeWorkspacePending.set(true);
    try {
      beginNativeAttestation(uid, nonce, capability);
      await signOut(auth);
      const result = await signInWithCustomToken(auth, token);
      if (result.user.uid !== uid || !isTrustedNativeWorkspaceContext()) {
        await signOut(auth);
        throw new Error("Workspace identity mismatch");
      }
      nativeWorkspacePending.set(false);
      notifyNativeWorkspace("signedIn");
    } catch {
      clearNativeAttestation();
      notifyNativeWorkspace("failed");
    } finally {
      signingIn = false;
    }
  };
  notifyNativeWorkspace("ready");
  readyInterval = setInterval(() => notifyNativeWorkspace("ready"), 250);
  readyDeadline = setTimeout(stopReadyAnnouncements, 45_000);
  window.addEventListener?.("pagehide", stopReadyAnnouncements, { once: true });
}
