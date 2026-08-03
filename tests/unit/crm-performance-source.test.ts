import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('CRM performance source boundaries', () => {
  it('pins release budgets to the Core Web Vitals good thresholds', () => {
    const budgets = JSON.parse(
      source('config/crm-performance-budgets.json'),
    );

    expect(budgets.coreWebVitals).toEqual({
      maxLcpMilliseconds: 2500,
      maxInpMilliseconds: 200,
      maxCls: 0.1,
    });
    expect(budgets.runtimeBudgets).toMatchObject({
      maxAuthenticatedDashboardFirestoreListeners: 4,
      maxDashboardCollectionListeners: 3,
      maxAuthenticatedDashboardBackendRequests: 1,
      maxVisibleRosterRefreshesPerMinute: 1,
      maxHiddenRosterRefreshesPerMinute: 0,
    });
  });

  it('keeps feature routes and global search out of the initial CRM entry', () => {
    const crmApp = source('src/components/crm/CrmApp.svelte');
    const shell = source('src/components/crm/CrmShell.svelte');

    expect(crmApp).toContain("Dashboard: () => import('./GlobalDashboard.svelte')");
    expect(crmApp).toContain("Financials: () => import('./Financials.svelte')");
    expect(crmApp).not.toMatch(
      /import\s+Financials\s+from\s+['"]\.\/Financials\.svelte['"]/,
    );
    expect(crmApp).not.toMatch(
      /import\s+EventScheduler\s+from\s+['"]\.\/EventScheduler\.svelte['"]/,
    );
    expect(shell).toContain("await import('./GlobalSearch.svelte')");
    expect(shell).not.toMatch(
      /import\s+GlobalSearch\s+from\s+['"]\.\/GlobalSearch\.svelte['"]/,
    );
  });

  it('initializes Storage only from upload-capable feature modules', () => {
    const firebaseCore = source('src/lib/firebase.ts');
    const firebaseStorage = source('src/lib/firebaseStorage.ts');

    expect(firebaseCore).not.toContain("from 'firebase/storage'");
    expect(firebaseCore.indexOf('initializeAppCheck')).toBeLessThan(
      firebaseCore.indexOf('getAuth(firebaseApp)'),
    );
    expect(firebaseStorage).toContain(
      'export function getFirebaseStorage(): FirebaseStorage',
    );
    expect(firebaseStorage).toContain('getStorage(firebaseApp)');
  });

  it('uses a route-specific compact favicon and defers list media decoding', () => {
    const layout = source('src/layouts/CrmLayout.astro');
    const eventScheduler = source('src/components/crm/EventScheduler.svelte');
    const mediaManager = source('src/components/crm/MediaManager.svelte');
    const playerTable = source(
      'src/components/crm/roster/PlayerTable.svelte',
    );
    const seasonsManager = source(
      'src/components/crm/seasons/SeasonsManager.svelte',
    );

    expect(layout).toContain('href="/crm-favicon.png"');
    for (const component of [
      eventScheduler,
      mediaManager,
      playerTable,
      seasonsManager,
    ]) {
      expect(component).toContain('loading="lazy"');
      expect(component).toContain('decoding="async"');
      expect(component).toMatch(/width="\d+"/);
      expect(component).toMatch(/height="\d+"/);
    }
  });

  it('keeps roster refreshes single-path and pauses polling in background tabs', () => {
    const rosterManager = source(
      'src/components/crm/roster/RosterManager.svelte',
    );
    const rosterService = source('src/lib/services/RosterService.ts');

    expect(rosterManager).not.toMatch(/import\s*\{[^}]*onMount/);
    expect(rosterManager).not.toContain('tenantIdStore.subscribe');
    expect(rosterService).toContain("document.visibilityState === 'visible'");
    expect(rosterService).toContain('}, 60_000)');
    expect(rosterService).toContain(
      "document.addEventListener('visibilitychange'",
    );
  });

  it('collects authenticated RUM without product or customer payloads', () => {
    const rum = source('src/lib/performance/crmRum.ts');
    const crmApp = source('src/components/crm/CrmApp.svelte');
    const environment = source('src/lib/config/publicEnvironment.ts');

    expect(rum).toContain("observe('largest-contentful-paint'");
    expect(rum).toContain("observe('layout-shift'");
    expect(rum).toContain("'X-Firebase-AppCheck'");
    expect(rum).toContain('/operations/performance/rum');
    expect(rum).not.toContain('userId');
    expect(rum).not.toContain('email');
    expect(rum).not.toContain('financial');
    expect(crmApp).toContain('startCrmRumCapture');
    expect(crmApp).toContain('getAppCheckToken(appCheck, false)');
    expect(environment).toContain('PUBLIC_WEBSITE_COMMIT');
  });

  it('keeps redundant production controls out of the public Vite environment', () => {
    const releaseGate = source('.github/workflows/crm-release-gate.yml');
    const acceptance = source('.github/workflows/crm-production-acceptance.yml');
    const preflight = source('scripts/release/crm-release.mjs');

    for (const workflow of [releaseGate, acceptance]) {
      expect(workflow).toContain(
        'HUDDLEWAY_RELEASE_BACKEND_URL: https://api.huddleway.com',
      );
      expect(workflow).toContain(
        'HUDDLEWAY_RELEASE_FIREBASE_PROJECT_ID: sports-team-apps',
      );
      expect(workflow).toContain(
        'HUDDLEWAY_RELEASE_FIREBASE_USE_EMULATORS: "false"',
      );
      expect(workflow).not.toMatch(/^\s+PUBLIC_BACKEND_URL:/m);
      expect(workflow).not.toMatch(/^\s+PUBLIC_FIREBASE_PROJECT_ID:/m);
      expect(workflow).not.toMatch(/^\s+PUBLIC_FIREBASE_USE_EMULATORS:/m);
    }

    expect(preflight).toContain("'PUBLIC_BACKEND_URL'");
    expect(preflight).toContain("'PUBLIC_FIREBASE_PROJECT_ID'");
    expect(preflight).toContain("'PUBLIC_FIREBASE_USE_EMULATORS'");
    expect(preflight).toContain('HUDDLEWAY_RELEASE_BACKEND_URL');
    expect(preflight).toContain('HUDDLEWAY_RELEASE_FIREBASE_PROJECT_ID');
    expect(preflight).toContain(
      'HUDDLEWAY_RELEASE_FIREBASE_USE_EMULATORS',
    );
  });
});
