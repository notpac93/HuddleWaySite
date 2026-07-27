import { describe, expect, it } from 'vitest';
import {
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
