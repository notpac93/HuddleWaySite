import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import {
  publicEnvironment,
  resolveFirebaseEnvironment,
} from './config/publicEnvironment';

const firebaseEnvironment = resolveFirebaseEnvironment(publicEnvironment);

// Initialize Firebase only once
export const firebaseApp = !getApps().length
  ? initializeApp(firebaseEnvironment.config)
  : getApp();

export const appCheck: AppCheck | null =
  typeof window !== 'undefined' && firebaseEnvironment.appCheck.enabled
    ? initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(
          firebaseEnvironment.appCheck.siteKey!,
        ),
        isTokenAutoRefreshEnabled: true,
      })
    : null;

function resolveAuth(): Auth {
  if (typeof window === 'undefined') return getAuth(firebaseApp);
  try {
    // HuddleWay uses email/password authentication. Omitting the browser
    // popup/redirect resolver avoids loading Google's cross-origin auth iframe
    // on CRM routes that do not offer federated sign-in.
    return initializeAuth(firebaseApp, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch (error) {
    const code = String((error as { code?: unknown })?.code || '');
    if (code === 'auth/already-initialized') return getAuth(firebaseApp);
    throw error;
  }
}

export const auth = resolveAuth();
export const db = getFirestore(firebaseApp);

const emulatorMarker = '__huddlewayFirebaseEmulatorsConnected';
const globalMarker = globalThis as typeof globalThis & {
  [emulatorMarker]?: boolean;
};

if (
  firebaseEnvironment.emulators.enabled
  && !globalMarker[emulatorMarker]
) {
  connectAuthEmulator(auth, firebaseEnvironment.emulators.authUrl, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(
    db,
    firebaseEnvironment.emulators.firestoreHost,
    firebaseEnvironment.emulators.firestorePort,
  );
  globalMarker[emulatorMarker] = true;
}
