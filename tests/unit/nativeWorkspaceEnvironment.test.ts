import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('native workspace environment boundary', () => {
  for (const [project, own, other] of [
    ['sports-team-apps', 'https://huddleway-app-preview-prod.web.app', 'https://huddleway-dev-admin.web.app'],
    ['huddleway-dev', 'https://huddleway-dev-admin.web.app', 'https://huddleway-app-preview-prod.web.app'],
  ]) {
    it(`binds ${project} to exactly its own workspace`, async () => {
      vi.stubEnv('PUBLIC_FIREBASE_PROJECT_ID', project);
      vi.resetModules();
      const location = { origin: own, pathname: '/admin/', search: '?nativeWorkspace=1' };
      vi.stubGlobal('window', { location });
      const context = await import('../../src/lib/crm/nativeWorkspaceContext');
      expect(context.isTrustedNativeWorkspaceContext()).toBe(true);
      for (const origin of [other, own + '.evil.test', own.replace('https:', 'http:')]) {
        location.origin = origin;
        expect(context.isTrustedNativeWorkspaceContext()).toBe(false);
      }
      location.origin = own;
      location.pathname = '/account/';
      expect(context.isTrustedNativeWorkspaceContext()).toBe(false);
    });
  }
});
