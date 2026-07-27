import { getToken as getAppCheckToken } from 'firebase/app-check';
import { appCheck, auth } from '../firebase';
import { resolveBackendUrl, publicEnvironment } from '../config/publicEnvironment';
import { BackendApi } from './BackendApi';

export const backendClient = new BackendApi({
  baseUrl: resolveBackendUrl(publicEnvironment),
  getIdToken: async (forceRefresh) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in to continue.');
    return user.getIdToken(forceRefresh);
  },
  getAppCheckToken: async (forceRefresh) => {
    if (!appCheck) return '';
    return (await getAppCheckToken(appCheck, forceRefresh)).token;
  },
  requireAppCheck: publicEnvironment.PROD === true,
});
