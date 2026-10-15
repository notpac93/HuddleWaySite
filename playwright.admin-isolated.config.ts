import { defineConfig } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import base from './playwright.config';

// Separate app, emulator data and browser contexts from any developer session.
// Refuse occupied ports rather than attaching to an existing instance.
const projectId = 'demo-huddleway-admin-ui';
const baseURL = 'http://127.0.0.1:4347';
process.env.PLAYWRIGHT_FIREBASE_PROJECT_ID = projectId;
process.env.PLAYWRIGHT_AUTH_EMULATOR_PORT = '29099';
process.env.PLAYWRIGHT_FIRESTORE_EMULATOR_PORT = '28181';
process.env.PLAYWRIGHT_ISOLATED_ADMIN = '1';
const emulatorDirectory = mkdtempSync(join(tmpdir(), 'huddleway-admin-ui-'));
const emulatorConfig = join(emulatorDirectory, 'firebase.json');
writeFileSync(emulatorConfig, JSON.stringify({
  firestore: { rules: resolve('..', 'firestore.rules'), indexes: resolve('..', 'firestore.indexes.json') },
  emulators: {
    auth: { host: '127.0.0.1', port: 29099 },
    firestore: { host: '127.0.0.1', port: 28181, websocketPort: 29150 },
    hub: { host: '127.0.0.1', port: 24400 },
    logging: { host: '127.0.0.1', port: 24500 },
    ui: { enabled: false },
  },
}));

export default defineConfig({
  ...base,
  testMatch: 'authenticated-crm.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/admin-isolated',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/admin-isolated', open: 'never' }]],
  use: { ...base.use, baseURL, actionTimeout: 10_000 },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4347 --ignore-lock',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      env: {
        ...process.env,
        ASTRO_DEV_BACKGROUND: '0',
        PUBLIC_BACKEND_URL: 'http://127.0.0.1:28182',
        PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
        PUBLIC_FIREBASE_APP_ID: '1:123456789:web:e2e',
        PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
        PUBLIC_FIREBASE_PROJECT_ID: projectId,
        PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
        PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.firebasestorage.app`,
        PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'false',
        PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: '',
        PUBLIC_APP_PREVIEW_URL: '',
        PUBLIC_FIREBASE_USE_EMULATORS: 'true',
        PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:29099',
        PUBLIC_FIRESTORE_EMULATOR_HOST: '127.0.0.1',
        PUBLIC_FIRESTORE_EMULATOR_PORT: '28181',
      },
    },
    {
      command: `firebase emulators:start --only auth,firestore --project ${projectId} --config "${emulatorConfig}"`,
      cwd: emulatorDirectory,
      url: `http://127.0.0.1:29099/emulator/v1/projects/${projectId}/config`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGINT', timeout: 10_000 },
    },
  ],
});
