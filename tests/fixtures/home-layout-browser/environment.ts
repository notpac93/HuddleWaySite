export * from '../../../src/lib/config/publicEnvironment.ts';
export const publicEnvironment = { DEV: true, PUBLIC_FIREBASE_PROJECT_ID: 'demo-layout-fixture' };
// Test-only loopback frame; never imported by a production entry point.
export function resolveCrmAppPreviewUrl() { return import.meta.env.VITE_REAL_CONSUMER_PREVIEW_URL || 'http://127.0.0.1:8892'; }
