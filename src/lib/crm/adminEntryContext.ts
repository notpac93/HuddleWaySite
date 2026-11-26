import { type Auth, signOut } from 'firebase/auth';
import { isNativeWorkspace, notifyNativeWorkspace } from './nativeWorkspaceContext';
/** A requested program is navigation context, never proof of access. */
export function requestedAdminProgram(location?: Pick<Location, 'search'>): string | null {
  if (!location) return null;
  const value = new URLSearchParams(location.search).get('program')?.trim() ?? '';
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) ? value : null;
}
export function authorizedEntryProgram(authorized: string[], requested: string | null, current: string | null) {
  return requested && authorized.includes(requested) ? requested : current;
}
export const usesAppEntry = import.meta.env.PUBLIC_ADMIN_APP_ENTRY === 'true';
let signingOut = false;

export function returnToAppSignIn(hasFirebaseSession: boolean) {
  // Native custom-token sign-in can finish before the portal's auth observer
  // publishes the new user. An empty portal store alone is not a sign-out.
  if (hasFirebaseSession) return;
  if (isNativeWorkspace) {
    if (!signingOut) notifyNativeWorkspace('failed');
    return;
  }
  if (typeof window !== 'undefined' && usesAppEntry) {
    window.location.replace('/#/admin/login?quick=1&initialProgramSelection=1');
  }
}

// Explicit sign-out, including the required sign-in after a password change.
export async function endAdminSession(auth: Auth) {
  signingOut = true;
  try {
    await signOut(auth);
    if (isNativeWorkspace) notifyNativeWorkspace('signedOut');
  } catch (error) {
    signingOut = false;
    throw error;
  }
}

export function clearRequestedAdminProgram() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('program')) return;
  url.searchParams.delete('program');
  window.history.replaceState({}, '', url);
}
