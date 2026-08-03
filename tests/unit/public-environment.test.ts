import { describe, expect, it } from 'vitest';
import {
  resolveCrmAppPreviewUrl,
  resolveBackendUrl,
  resolveFirebaseEnvironment,
  resolveWebsiteCommit,
} from '../../src/lib/config/publicEnvironment';

describe('public environment contract', () => {
  it('defaults production builds to the authoritative HuddleWay services', () => {
    expect(resolveBackendUrl({ PROD: true })).toBe('https://api.huddleway.com');
    expect(
      resolveFirebaseEnvironment({
        PROD: true,
        PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'enterprise-site-key',
      }).config.projectId,
    ).toBe('sports-team-apps');
  });

  it('refuses an insecure or loopback production backend', () => {
    expect(() =>
      resolveBackendUrl({
        PROD: true,
        PUBLIC_BACKEND_URL: 'http://localhost:3001',
      }),
    ).toThrow(/non-loopback https/i);
  });

  it('allows explicit loopback emulators only outside production', () => {
    expect(
      resolveFirebaseEnvironment({
        DEV: true,
        PUBLIC_FIREBASE_USE_EMULATORS: 'true',
        PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
        PUBLIC_FIRESTORE_EMULATOR_HOST: 'localhost',
        PUBLIC_FIRESTORE_EMULATOR_PORT: '8080',
      }).emulators,
    ).toMatchObject({
      enabled: true,
      firestoreHost: 'localhost',
      firestorePort: 8080,
    });

    expect(() =>
      resolveFirebaseEnvironment({
        PROD: true,
        PUBLIC_FIREBASE_USE_EMULATORS: 'true',
      }),
    ).toThrow(/forbidden in production/i);
  });

  it('requires App Check configuration in production', () => {
    expect(() => resolveFirebaseEnvironment({ PROD: true })).toThrow(
      /require Firebase App Check/i,
    );

    expect(
      resolveFirebaseEnvironment({
        PROD: true,
        PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'enterprise-site-key',
      }).appCheck,
    ).toEqual({
      enabled: true,
      provider: 'recaptcha-enterprise',
      siteKey: 'enterprise-site-key',
    });
  });

  it('allows the Development Firebase project to run without browser App Check', () => {
    expect(
      resolveFirebaseEnvironment({
        PROD: true,
        PUBLIC_FIREBASE_PROJECT_ID: 'huddleway-dev',
        PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'false',
      }).appCheck,
    ).toEqual({
      enabled: false,
      provider: 'recaptcha-enterprise',
      siteKey: null,
    });

    expect(
      resolveFirebaseEnvironment({
        PROD: true,
        PUBLIC_FIREBASE_PROJECT_ID: 'huddleway-dev',
        PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'false',
        PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'production-key-from-env-file',
      }).appCheck.enabled,
    ).toBe(false);
  });

  it('exposes the Dev Flutter preview only to Development CRM builds', () => {
    expect(resolveCrmAppPreviewUrl({ DEV: true })).toBe(
      'https://huddleway-app-preview-canary.web.app',
    );
    expect(resolveCrmAppPreviewUrl({ PROD: true })).toBeNull();
    expect(() =>
      resolveCrmAppPreviewUrl({
        PROD: true,
        PUBLIC_APP_PREVIEW_URL: 'https://huddleway-app-preview-canary.web.app',
      }),
    ).toThrow(/cannot embed the Dev app preview/i);
  });

  it('binds production RUM to the full website commit', () => {
    const commit = 'a'.repeat(40);
    expect(
      resolveWebsiteCommit({
        PROD: true,
        PUBLIC_WEBSITE_COMMIT: commit,
      }),
    ).toBe(commit);
    expect(resolveWebsiteCommit({ PROD: true })).toBeNull();
    expect(resolveWebsiteCommit({ DEV: true })).toBeNull();
  });
});
