import { getToken as getAppCheckToken } from 'firebase/app-check';
import { appCheck, auth, firebaseEnvironment } from '../firebase';
import { resolveBackendUrl, publicEnvironment } from '../config/publicEnvironment';
import { BackendApi } from './BackendApi';

export const backendClient = new BackendApi({
  baseUrl: resolveBackendUrl(publicEnvironment),
  getIdToken: async (forceRefresh) => {
    // Lazy-loaded CRM modules can mount while Firebase is still restoring the
    // persisted browser session. Wait for that first auth resolution before
    // deciding the administrator is signed out.
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in to continue.');
    return user.getIdToken(forceRefresh);
  },
  getAppCheckToken: async (forceRefresh) => {
    if (!appCheck) return '';
    return (await getAppCheckToken(appCheck, forceRefresh)).token;
  },
  // Static Astro builds set PROD=true for both Dev and Production artifacts.
  // Enforce App Check based on the resolved Firebase project, so a Dev build
  // cannot require a browser token that Dev intentionally does not enable.
  requireAppCheck:
    firebaseEnvironment.config.projectId === 'sports-team-apps',
});
