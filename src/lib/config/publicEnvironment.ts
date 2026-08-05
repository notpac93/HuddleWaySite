export interface PublicEnvironment {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
  PUBLIC_BACKEND_URL?: string;
  VITE_API_URL?: string;
  PUBLIC_FIREBASE_API_KEY?: string;
  PUBLIC_FIREBASE_APP_ID?: string;
  PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  PUBLIC_FIREBASE_PROJECT_ID?: string;
  PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
  PUBLIC_FIREBASE_APP_CHECK_ENABLED?: string;
  PUBLIC_FIREBASE_APP_CHECK_SITE_KEY?: string;
  PUBLIC_WEBSITE_COMMIT?: string;
  PUBLIC_APP_PREVIEW_URL?: string;
  PUBLIC_FIREBASE_USE_EMULATORS?: string;
  PUBLIC_FIREBASE_AUTH_EMULATOR_URL?: string;
  PUBLIC_FIRESTORE_EMULATOR_HOST?: string;
  PUBLIC_FIRESTORE_EMULATOR_PORT?: string;
}

export interface ResolvedFirebaseEnvironment {
  config: {
    apiKey: string;
    appId: string;
    messagingSenderId: string;
    projectId: string;
    authDomain: string;
    storageBucket: string;
    measurementId?: string;
  };
  emulators: {
    enabled: boolean;
    authUrl: string;
    firestoreHost: string;
    firestorePort: number;
  };
  appCheck: {
    enabled: boolean;
    provider: 'recaptcha-enterprise';
    siteKey: string | null;
  };
}

const productionFirebase = {
  apiKey: 'AIzaSyCGSijl_2_SLsjUm87ntQkbEKo1BcTf_8E',
  appId: '1:1068805219666:web:f6af250b5d61784619868b',
  messagingSenderId: '1068805219666',
  projectId: 'sports-team-apps',
  authDomain: 'sports-team-apps.firebaseapp.com',
  storageBucket: 'sports-team-apps.firebasestorage.app',
  measurementId: 'G-REX4R08EJN',
};

const developmentFirebase = {
  apiKey: 'AIzaSyDVZSVTxyiRh2TUIIE6ACmOLgdOPqB3TvA',
  appId: '1:630775109089:web:117ca765cab994f2ee2ea0',
  messagingSenderId: '630775109089',
  projectId: 'huddleway-dev',
  authDomain: 'huddleway-dev.firebaseapp.com',
  storageBucket: 'huddleway-dev.firebasestorage.app',
};

const developmentAppPreviewOrigin = 'https://huddleway-app-preview-canary.web.app';
const productionAppPreviewOrigin = 'https://sports-team-apps.web.app';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(value: unknown) {
  return normalized(value).toLowerCase() === 'true';
}

function assertLoopbackUrl(value: string, field: string) {
  const parsed = new URL(value);
  if (!loopbackHosts.has(parsed.hostname) || parsed.protocol !== 'http:') {
    throw new Error(`${field} must use an http loopback URL.`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function assertLoopbackHost(value: string, field: string) {
  if (!loopbackHosts.has(value)) {
    throw new Error(`${field} must be a loopback host.`);
  }
  return value;
}

export function resolveBackendUrl(environment: PublicEnvironment) {
  const fallback = environment.PROD
    ? 'https://api.huddleway.com'
    : 'http://localhost:3001';
  const raw =
    normalized(environment.PUBLIC_BACKEND_URL)
    || normalized(environment.VITE_API_URL)
    || fallback;
  const parsed = new URL(raw);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('PUBLIC_BACKEND_URL must use http or https.');
  }
  if (
    environment.PROD
    && (parsed.protocol !== 'https:' || loopbackHosts.has(parsed.hostname))
  ) {
    throw new Error(
      'Production CRM builds require a non-loopback https PUBLIC_BACKEND_URL.',
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      'PUBLIC_BACKEND_URL cannot contain credentials, query parameters, or a fragment.',
    );
  }
  return parsed.toString().replace(/\/$/, '');
}

export function resolveWebsiteCommit(environment: PublicEnvironment) {
  const commit = normalized(environment.PUBLIC_WEBSITE_COMMIT).toLowerCase();
  return /^[a-f0-9]{40}$/.test(commit) ? commit : null;
}

export function resolveCrmAppPreviewUrl(environment: PublicEnvironment) {
  const projectId =
    normalized(environment.PUBLIC_FIREBASE_PROJECT_ID)
    || (environment.PROD
      ? productionFirebase.projectId
      : developmentFirebase.projectId);
  const explicit = normalized(environment.PUBLIC_APP_PREVIEW_URL);
  const raw = explicit || (
    projectId === developmentFirebase.projectId
      ? developmentAppPreviewOrigin
      : projectId === productionFirebase.projectId
        ? productionAppPreviewOrigin
        : ''
  );
  if (!raw) return null;

  const parsed = new URL(raw);
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(
      'PUBLIC_APP_PREVIEW_URL must be a credential-free HTTPS origin.',
    );
  }
  if (
    projectId === productionFirebase.projectId
    && parsed.origin === developmentAppPreviewOrigin
  ) {
    throw new Error('Production CRM cannot embed the Dev app preview.');
  }
  return parsed.origin;
}

export function resolveFirebaseEnvironment(
  environment: PublicEnvironment,
): ResolvedFirebaseEnvironment {
  // Astro's static builds set PROD=true for both Dev and Production artifacts.
  // Prefer the explicitly selected Firebase project so a Dev artifact never
  // inherits Production credentials merely because it was built statically.
  const explicitProjectId = normalized(environment.PUBLIC_FIREBASE_PROJECT_ID);
  const fallback = explicitProjectId === developmentFirebase.projectId
    ? developmentFirebase
    : explicitProjectId === productionFirebase.projectId
      ? productionFirebase
      : environment.PROD
        ? productionFirebase
        : developmentFirebase;
  const fallbackMeasurementId = fallback === productionFirebase
    ? productionFirebase.measurementId
    : undefined;
  const config = {
    apiKey: normalized(environment.PUBLIC_FIREBASE_API_KEY) || fallback.apiKey,
    appId: normalized(environment.PUBLIC_FIREBASE_APP_ID) || fallback.appId,
    messagingSenderId:
      normalized(environment.PUBLIC_FIREBASE_MESSAGING_SENDER_ID)
      || fallback.messagingSenderId,
    projectId:
      normalized(environment.PUBLIC_FIREBASE_PROJECT_ID) || fallback.projectId,
    authDomain:
      normalized(environment.PUBLIC_FIREBASE_AUTH_DOMAIN)
      || fallback.authDomain,
    storageBucket:
      normalized(environment.PUBLIC_FIREBASE_STORAGE_BUCKET)
      || fallback.storageBucket,
    measurementId:
      normalized(environment.PUBLIC_FIREBASE_MEASUREMENT_ID)
      || fallbackMeasurementId,
  };

  const emulatorEnabled = booleanValue(
    environment.PUBLIC_FIREBASE_USE_EMULATORS,
  );
  const appCheckSiteKey = normalized(
    environment.PUBLIC_FIREBASE_APP_CHECK_SITE_KEY,
  );
  const appCheckSetting = normalized(
    environment.PUBLIC_FIREBASE_APP_CHECK_ENABLED,
  );
  const appCheckEnabled = appCheckSetting
    ? booleanValue(appCheckSetting)
    : Boolean(appCheckSiteKey);
  const authUrl =
    normalized(environment.PUBLIC_FIREBASE_AUTH_EMULATOR_URL)
    || 'http://127.0.0.1:9099';
  const firestoreHost =
    normalized(environment.PUBLIC_FIRESTORE_EMULATOR_HOST) || '127.0.0.1';
  const firestorePort = Number.parseInt(
    normalized(environment.PUBLIC_FIRESTORE_EMULATOR_PORT) || '8080',
    10,
  );

  if (
    emulatorEnabled
    && (
      environment.PROD
      || !Number.isInteger(firestorePort)
      || firestorePort < 1
      || firestorePort > 65535
    )
  ) {
    throw new Error(
      'Firebase emulators are forbidden in production and require a valid Firestore port.',
    );
  }
  if (appCheckEnabled && !appCheckSiteKey) {
    throw new Error(
      'PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is required when App Check is enabled.',
    );
  }
  // Astro's static build sets PROD=true even for a Development-targeted
  // release build. Use the resolved Firebase project to enforce the
  // production-only App Check requirement instead of the build mode alone.
  if (config.projectId === productionFirebase.projectId && !appCheckEnabled) {
    throw new Error(
      'Production CRM builds require Firebase App Check configuration.',
    );
  }

  return {
    config,
    emulators: {
      enabled: emulatorEnabled,
      authUrl: emulatorEnabled
        ? assertLoopbackUrl(authUrl, 'PUBLIC_FIREBASE_AUTH_EMULATOR_URL')
        : authUrl,
      firestoreHost: emulatorEnabled
        ? assertLoopbackHost(
            firestoreHost,
            'PUBLIC_FIRESTORE_EMULATOR_HOST',
          )
        : firestoreHost,
      firestorePort,
    },
    appCheck: {
      enabled: appCheckEnabled,
      provider: 'recaptcha-enterprise',
      siteKey: appCheckSiteKey || null,
    },
  };
}

export const publicEnvironment = import.meta.env as PublicEnvironment;
