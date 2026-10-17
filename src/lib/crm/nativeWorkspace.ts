import { writable } from 'svelte/store';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebase';

import { isNativeWorkspace, notifyNativeWorkspace, setNativeWorkspaceNonce } from './nativeWorkspaceContext';
export { isNativeWorkspace, notifyNativeWorkspace };
export const nativeWorkspacePending = writable(isNativeWorkspace);

if (isNativeWorkspace) {
  let signingIn = false;
  window.huddlewayNativeSignIn = async (token, uid, nonce) => {
    if (signingIn) return;
    signingIn = true;
    setNativeWorkspaceNonce(nonce);
    nativeWorkspacePending.set(true);
    try {
      await signOut(auth);
      const result = await signInWithCustomToken(auth, token);
      if (result.user.uid !== uid) {
        await signOut(auth);
        throw new Error('Workspace identity mismatch');
      }
      nativeWorkspacePending.set(false);
      notifyNativeWorkspace('signedIn');
    } catch {
      notifyNativeWorkspace('failed');
    } finally {
      signingIn = false;
    }
  };
  notifyNativeWorkspace('ready');
}
