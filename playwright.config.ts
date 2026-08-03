import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4337';
const parsedBaseURL = new URL(baseURL);
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
const backendRoot = process.env.HUDDLEWAY_BACKEND_ROOT ?? resolve(process.cwd(), '../../HuddleWay');

if (!loopbackHosts.has(parsedBaseURL.hostname)) {
  throw new Error(
    `E2E tests must use a loopback-only base URL. Received: ${parsedBaseURL.origin}`,
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --host ${parsedBaseURL.hostname} --port ${parsedBaseURL.port || '4337'} --ignore-lock`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        ASTRO_DEV_BACKGROUND: '0',
        PUBLIC_FIREBASE_API_KEY: 'fake-api-key',
        PUBLIC_FIREBASE_APP_ID: '1:123456789:web:e2e',
        PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456789',
        PUBLIC_FIREBASE_PROJECT_ID: 'demo-huddleway-crm',
        PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-huddleway-crm.firebaseapp.com',
        PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-huddleway-crm.firebasestorage.app',
        PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'false',
        PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: '',
        PUBLIC_FIREBASE_USE_EMULATORS: 'true',
        PUBLIC_FIREBASE_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
        PUBLIC_FIRESTORE_EMULATOR_HOST: '127.0.0.1',
        PUBLIC_FIRESTORE_EMULATOR_PORT: '8080',
      },
    },
    {
      command:
        'npx --yes firebase-tools@15.23.0 emulators:start --only auth,firestore --project demo-huddleway-crm',
      cwd: backendRoot,
      url:
        'http://127.0.0.1:9099/emulator/v1/projects/demo-huddleway-crm/config',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
