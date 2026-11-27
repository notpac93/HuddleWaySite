import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeAuth: vi.fn(),
  local: { name: 'local' },
  indexed: { name: 'indexed' },
  memory: { name: 'memory' },
}));

vi.mock('firebase/app', () => ({ getApps: () => [], initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  initializeAuth: mocks.initializeAuth,
  browserLocalPersistence: mocks.local,
  indexedDBLocalPersistence: mocks.indexed,
  inMemoryPersistence: mocks.memory,
}));
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}) }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: class {},
}));

afterEach(() => vi.unstubAllGlobals());

test.each([
  ['https://huddleway-dev-admin.web.app', '?nativeWorkspace=1', mocks.memory],
  ['https://huddleway-dev-admin.web.app', '', [mocks.local, mocks.indexed]],
  ['https://huddleway-crm-canary.web.app', '?nativeWorkspace=1', [mocks.local, mocks.indexed]],
])('scopes Firebase persistence to the workspace at %s%s', async (origin, search, persistence) => {
  vi.resetModules();
  vi.stubGlobal('window', { location: { origin, pathname: '/admin/', search } });

  await import('../../src/lib/firebase');

  expect(mocks.initializeAuth).toHaveBeenCalledWith({}, { persistence });
});
