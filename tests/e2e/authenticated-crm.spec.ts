import { expect, test, type Page } from '@playwright/test';

const projectId = process.env.PLAYWRIGHT_FIREBASE_PROJECT_ID || 'demo-huddleway-crm';
if (!/^demo-[a-z0-9-]+$/.test(projectId)) throw new Error('Browser fixtures require a demo Firebase project.');
const authBaseUrl = `http://127.0.0.1:${process.env.PLAYWRIGHT_AUTH_EMULATOR_PORT ?? '9099'}`;
const firestoreBaseUrl = `http://127.0.0.1:${process.env.PLAYWRIGHT_FIRESTORE_EMULATOR_PORT ?? '8181'}`;
const password = 'FixturePass123!';
const crmTabs = [
  'Dashboard',
  'Teams',
  'Seasons',
  'Roster',
  'Events',
  'Registration',
  'Financials',
  'Messages',
  'Documents',
  'Staff',
  'Media',
  'My App',
  'Settings',
  'Activity',
];

test.beforeEach(async ({ context }) => {
  if (process.env.PLAYWRIGHT_ISOLATED_ADMIN !== '1') return;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue();
    if (url.hostname !== '127.0.0.1' || !['4347', '29099', '28181', '28182'].includes(url.port)) {
      throw new Error(`Isolated admin browser attempted an external request: ${url.origin}${url.pathname}`);
    }
    // Specific backend fixtures registered on the page take precedence.
    if (url.port === '28182') {
      return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: `Missing browser fixture: ${url.pathname}` }) });
    }
    await route.continue();
  });
});

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

async function writeDocument(
  collection: string,
  id: string,
  fields: Record<string, FirestoreValue>,
) {
  const response = await fetch(
    `${firestoreBaseUrl}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer owner',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `E2E fixture document ${collection}/${id} could not be written (${response.status}).`,
    );
  }
}

async function seedVerifiedOwner(projectName: string) {
  const suffix = projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const uid = `e2e-owner-${suffix}`;
  const tenantId = `e2e-tenant-${suffix}`;
  const email = `${uid}@huddleway.test`;
  const authorizationHeaders = {
    Authorization: 'Bearer owner',
    'Content-Type': 'application/json',
    'x-goog-user-project': projectId,
  };

  const createResponse = await fetch(
    `${authBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: authorizationHeaders,
      body: JSON.stringify({
        localId: uid,
        email,
        emailVerified: true,
        password,
      }),
    },
  );
  if (!createResponse.ok && createResponse.status !== 400) {
    throw new Error(
      `E2E Auth fixture could not be created (${createResponse.status}).`,
    );
  }

  const updateResponse = await fetch(
    `${authBaseUrl}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake-api-key`,
    {
      method: 'POST',
      headers: authorizationHeaders,
      body: JSON.stringify({
        localId: uid,
        email,
        emailVerified: true,
        password,
      }),
    },
  );
  if (!updateResponse.ok) {
    throw new Error(
      `E2E Auth fixture could not be refreshed (${updateResponse.status}).`,
    );
  }

  const now = new Date().toISOString();
  await Promise.all([
    writeDocument('users', uid, {
      email: { stringValue: email },
      tenantId: { stringValue: tenantId },
      role: { stringValue: 'owner' },
      tenantRoles: {
        mapValue: {
          fields: {
            [tenantId]: { stringValue: 'owner' },
          },
        },
      },
    }),
    writeDocument('tenant_memberships', `${tenantId}_${uid}`, {
      tenantId: { stringValue: tenantId },
      uid: { stringValue: uid },
      role: { stringValue: 'owner' },
      active: { booleanValue: true },
      status: { stringValue: 'active' },
      schemaVersion: { stringValue: 'tenant_membership_v1' },
    }),
    writeDocument('tenants', tenantId, {
      name: { stringValue: 'Fixture Athletics' },
      tenantId: { stringValue: tenantId },
      isPublic: { booleanValue: false },
    }),
    writeDocument('tenant_branding', tenantId, {
      name: { stringValue: 'Fixture Athletics' },
      tenantId: { stringValue: tenantId },
    }),
    writeDocument('teams', `team-${suffix}`, {
      tenantId: { stringValue: tenantId },
      name: { stringValue: 'Fixture Falcons' },
      division: { stringValue: 'U12' },
      description: { stringValue: 'Emulator-only E2E team' },
    }),
    writeDocument('events', `event-${suffix}`, {
      tenantId: { stringValue: tenantId },
      title: { stringValue: 'Fixture Practice' },
      type: { stringValue: 'practice' },
      startDate: { timestampValue: now },
    }),
    writeDocument('registrations', `registration-${suffix}`, {
      tenantId: { stringValue: tenantId },
      email: { stringValue: 'family@huddleway.test' },
      participantSummary: {
        mapValue: {
          fields: {
            fullName: { stringValue: 'Fixture Player' },
          },
        },
      },
      createdAt: { timestampValue: now },
    }),
  ]);

  return { email };
}

async function signIn(page: Page, email: string) {
  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Operations Portal' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Creating and administering a program is free. Stripe is optional and only needed if your program chooses to collect payments.',
    ),
  ).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Quick Actions')).toBeVisible();
}

async function mockAuthenticatedBackend(page: Page, tenantId: string) {
  const operationalResponses: Record<string, Record<string, unknown>> = {
    '/admin/owner-onboarding/vocabulary': { programProfile: null },
    '/admin/inbox/threads': { success: true, threads: [], truncated: false },
    '/admin/crm/documents': { documents: [], truncated: false },
    '/admin/staff': { staff: [], pendingInvites: [], truncated: { staff: false, pendingInvites: false } },
    '/admin/crm/component-studio': {
      templateId: 'fixture-template', templateVersion: 1, versionToken: 'fixture-layout-v1',
      definitions: [], pages: [{ id: 'fixture-home', route: '/', title: 'Home', components: [] }],
      versions: [], historyTruncated: false,
    },
    '/admin/communications/connected-mailbox': {
      success: true, connected: false, status: 'disconnected', provider: null,
      email: null, displayName: null, connectedAt: null, lastCheckedAt: null, availableProviders: [],
    },
    '/admin/messages/email-quota': {
      success: true, monthKey: '2026-10', resetsAt: '2026-11-01T00:00:00.000Z',
      monthlyLimit: 500, usedCount: 0, sentCount: 0, localSentCount: 0,
      providerSentCount: 0, reservedCount: 0, remainingCount: 500, perSendLimit: 100,
      capacityMode: 'normal', monthlyAllowanceVisible: true,
      emailSendingStatus: 'enabled', bounceRate: 0, complaintRate: 0,
    },
  };
  for (const [path, payload] of Object.entries(operationalResponses)) {
    await page.route(`**${path}?**`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...payload, tenantId, requestId: `e2e-${path}` }),
      });
    });
  }
  await page.route('**/admin/crm/dashboard-summary**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 'crm_dashboard_summary_v1', tenantId,
        counts: { registrations: 1, teams: 1, events: 1 },
        recentRegistrations: [{ id: 'registration-e2e', tenantId, participantSummary: { fullName: 'Fixture Player' } }],
        requestId: 'e2e-dashboard',
      }),
    });
  });
  await page.route('**/admin/crm/authorization', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantAccess: [{ tenantId, role: 'owner' }],
        canViewTenantOperations: false,
        tenantOperationsRole: null,
        requestId: 'e2e-authorization',
      }),
    });
  });

  await page.route('**/admin/crm/tenant-branding**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 'crm_tenant_branding_v1',
        tenantId,
        exists: true,
        branding: {
          name: 'Fixture Athletics',
          logoUrl: null,
          primaryColor: '',
          secondaryColor: '',
          tertiaryColor: '',
        },
        requestId: 'e2e-tenant-branding',
      }),
    });
  });

  await page.route('**/admin/crm/operational-records**', async (route) => {
    const url = new URL(route.request().url());
    const collection = url.searchParams.get('collection') || '';
    const records: Record<string, unknown>[] = {
      registrations: [{
        id: 'registration-e2e',
        tenantId,
        participantSummary: { fullName: 'Fixture Player' },
        userId: 'e2e-player',
        eventId: 'event-e2e',
        createdAt: new Date().toISOString(),
      }],
      registration_forms: [{
        id: 'form-e2e',
        tenantId,
        title: 'Fixture Registration',
        status: 'active',
        createdAt: new Date().toISOString(),
      }],
      events: [{
        id: 'event-e2e',
        tenantId,
        title: 'Fixture Practice',
        lifecycleStatus: 'published',
        isDeleted: false,
        isVisible: true,
        teamId: 'team-e2e',
        date: new Date().toISOString(),
      }],
      teams: [{
        id: 'team-e2e',
        tenantId,
        name: 'Fixture Falcons',
        description: 'Emulator-only E2E team',
        status: 'active',
      }],
      seasons: [],
      season_registrations: [],
    }[collection] || [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 'crm_operational_page_v1',
        tenantId,
        collection,
        records,
        hasMore: false,
        nextCursor: null,
        limit: 100,
        requestId: `e2e-${collection}`,
      }),
    });
  });

  await page.route('**/admin/crm/financial-overview**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId,
        transactions: [],
        refunds: [],
        invoices: [],
        deposits: [],
        complete: true,
        operations: {
          complete: true,
          generatedAt: new Date().toISOString(),
          timeZone: 'America/Los_Angeles',
          reconciliation: {
            complete: true, unreconciledTransactionCount: 0,
            unreconciledDepositCount: 0, currencyIntegrityErrorCount: 0,
          },
          views: { deposits: [], transactions: [], scheduled: [], overdue: [], invoices: [] },
        },
        recordCounts: {
          transactions: 0,
          payments: 0,
          refunds: 0,
          invoices: 0,
          deposits: 0,
        },
        tracking: {
          complete: true,
          unreconciledTransactionCount: 0,
          unreconciledDepositCount: 0,
          sourceCollections: [],
        },
        truncated: {
          transactions: false,
          refunds: false,
          invoices: false,
          deposits: false,
        },
        requestId: 'e2e-financials',
      }),
    });
  });

  await page.route('**/admin/roster/players**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId,
        teamId: null,
        players: [{
          id: 'registration-e2e',
          name: 'Fixture Player',
          imageUrl: null,
          role: 'Player',
          status: 'active',
          teamId: 'team-e2e',
          teamIds: ['team-e2e'],
          team: 'Fixture Falcons',
          email: 'family@huddleway.test',
        }],
        truncated: {
          registrations: false,
          memberships: false,
          teams: false,
        },
        requestId: 'e2e-roster',
      }),
    });
  });

  await page.route('**/admin/crm/app-configuration**', async (route) => {
    const isHistory = new URL(route.request().url()).pathname.endsWith('/history');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(isHistory
        ? {
            tenantId,
            versions: [],
            truncated: false,
            requestId: 'e2e-config-history',
          }
        : {
            tenantId,
            mode: 'initialize',
            configVersion: 0,
            publishedAt: null,
            publishedBy: null,
            configuration: null,
            versionToken: 'e2e-config-version',
            requestId: 'e2e-config',
          }),
    });
  });

  await page.route('**/admin/crm/audit-events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [],
        truncated: false,
        hasMore: false,
        nextCursor: null,
        limit: 50,
        requestId: 'e2e-audit',
      }),
    });
  });
}

async function openCrmTab(page: Page, tab: string, mobile: boolean) {
  const visibleLabel = tab === 'Settings' ? 'My profile' : tab;
  const appToggle = page.getByRole('button', { name: 'Admin tabs', exact: true });
  if (await appToggle.isVisible()) await appToggle.click();
  const appNavigation = page.locator('#app-admin-navigation.app-navigation-overlay');
  if (mobile || await appNavigation.isVisible()) {
    const quickAccess = page.getByRole('navigation', { name: 'Admin quick access' });
    if (['Dashboard', 'Events', 'Messages', 'My App'].includes(tab)) {
      await quickAccess.getByRole('button', { name: visibleLabel, exact: true }).click();
    } else {
      await quickAccess.getByRole('button', { name: /^More/ }).click();
      const drawer = page.getByRole('navigation', { name: 'More sections' });
      await drawer.getByRole('button', { name: visibleLabel, exact: true }).click();
      await expect(drawer).toBeHidden();
    }
  } else {
    const sidebar = page.locator('aside[data-sidebar-expanded]');
    await sidebar.hover();
    await sidebar.locator('nav').getByRole('button', {
      name: visibleLabel,
      exact: true,
    }).click();
  }

  await expect(
    page.locator('main h1.sr-only'),
  ).toHaveText(visibleLabel);
  await expect(
    page.locator('main span.sr-only').filter({ hasText: `Loading ${tab}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Module unavailable' }),
  ).toHaveCount(0);
  if (tab === 'Dashboard' || tab === 'Financials') {
    await expect(page.getByRole('alert').filter({ hasText: /invalid response|could not be loaded/i })).toHaveCount(0);
  }
}

test('verified owner can use the authenticated CRM shell by keyboard and mobile navigation', async ({
  page,
}, testInfo) => {
  // Fourteen lazy-loaded modules share this journey's total budget. Individual
  // visibility/loading assertions retain their five-second failure deadline.
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const backendFailures: string[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).port === '28182' && response.status() >= 400) backendFailures.push(`${response.status()} ${response.url()}`);
  });
  const mobile = Boolean(testInfo.project.use.isMobile);
  const { email } = await seedVerifiedOwner(testInfo.project.name);
  await mockAuthenticatedBackend(
    page,
    `e2e-tenant-${testInfo.project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
  );
  await signIn(page, email);

  await page.keyboard.press(
    mobile ? 'Control+K' : 'Meta+K',
  );
  const searchDialog = page.getByRole('dialog', {
    name: 'Search HuddleWay records',
  });
  await expect(searchDialog).toBeVisible();
  const searchInput = page.getByRole('searchbox', {
    name: 'Search players, teams, or events',
  });
  await expect(searchInput).toBeFocused();
  await searchInput.fill('Fixture Falcons');
  await expect(
    searchDialog.getByRole('button', { name: /Fixture Falcons/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(searchDialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Search across HuddleWay (Cmd+K)' }),
  ).toBeFocused();

  if (mobile) {
    const menuTrigger = page.getByRole('button', {
      name: 'Open navigation menu',
    });
    await menuTrigger.click();
    const navigationDialog = page.getByRole('dialog', {
      name: 'Fixture Athletics',
    });
    await expect(navigationDialog).toBeVisible();
    await expect(
      navigationDialog.getByRole('button', { name: 'Financials' }),
    ).toBeVisible();
    await expect(
      navigationDialog.getByRole('button', {
        name: 'Close navigation menu',
      }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(navigationDialog).toBeHidden();
    await expect(menuTrigger).toBeFocused();
  }

  for (const tab of crmTabs) {
    await test.step(`Open ${tab}`, async () => {
      await openCrmTab(page, tab, mobile);
      await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/i })).toHaveCount(0);
      await expect(page.getByRole('alert').filter({ hasText: /invalid response|could not be loaded|unavailable|failed|missing browser fixture/i })).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, `${tab} horizontal overflow`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`${tab.toLowerCase().replaceAll(' ', '-')}.png`) });
    });
  }

  // Selecting a team enters its workspace. Finish the organization-wide
  // navigation matrix before asserting this deliberate scope change.
  await page.keyboard.press(mobile ? 'Control+K' : 'Meta+K');
  await expect(searchDialog).toBeVisible();
  await expect(searchInput).toBeFocused();
  await searchInput.fill('Fixture Falcons');
  const teamResult = searchDialog.getByRole('button', { name: /Fixture Falcons/ });
  await expect(teamResult).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(teamResult).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(searchDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Teams', exact: true }).first()).toBeVisible();
  if (mobile) {
    await expect(page.getByRole('heading', { name: 'Fixture Falcons', exact: true, level: 2 })).toBeVisible();
  } else {
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')).toHaveText('Fixture Falcons');
  }

  const horizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth
      - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
  expect(backendFailures).toEqual([]);
});

test('admin tabs survive repeated visits, reload, and unsaved My App navigation', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const mobile = Boolean(testInfo.project.use.isMobile);
  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const { email } = await seedVerifiedOwner(testInfo.project.name);
  await mockAuthenticatedBackend(page, `e2e-tenant-${suffix}`);
  await signIn(page, email);

  for (const tab of [...crmTabs, ...crmTabs.toReversed()]) {
    await test.step(`Revisit ${tab}`, async () => {
      await openCrmTab(page, tab, mobile);
      await expect(page.locator('main [role="status"]').filter({ hasText: /^Loading/i })).toHaveCount(0);
      await expect(page.getByRole('alert').filter({ hasText: /invalid response|could not be loaded|unavailable|failed/i })).toHaveCount(0);
    });
  }
  await openCrmTab(page, 'Settings', mobile);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'My profile', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Operations Portal' })).toHaveCount(0);

  await openCrmTab(page, 'My App', mobile);
  await page.getByRole('button', { name: /^Edit app(?: Unpublished changes)?$/ }).click();
  for (const section of ['Pages', 'Components', 'Version history', 'Branding']) {
    await page.getByRole('navigation', { name: 'My App sections' }).getByRole('button', { name: section, exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /could not|unavailable|invalid/i })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'My App sections' }).getByRole('button', { name: section, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  const appName = page.getByLabel('App Name', { exact: true });
  await appName.fill('Unsaved test name');
  await page.getByRole('button', { name: 'Back to app', exact: true }).click();
  await page.getByRole('button', { name: 'Admin tabs', exact: true }).click();
  const events = page.getByRole('navigation', { name: 'Admin quick access' }).getByRole('button', { name: 'Events', exact: true });
  await events.click();
  const guard = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Keep editing', exact: true }) });
  await expect(guard).toBeVisible();
  await expect(guard.locator('.draft-navigation-actions button')).toHaveCount(2);
  await guard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await page.getByRole('button', { name: /^Edit app(?: Unpublished changes)?$/ }).click();
  await expect(appName).toHaveValue('Unsaved test name');
  await page.getByRole('button', { name: 'Back to app', exact: true }).click();
  if (await page.getByRole('button', { name: 'Admin tabs', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Admin tabs', exact: true }).click();
  }
  await events.click();
  await guard.getByRole('button', { name: 'Save draft & leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Events', exact: true, level: 1 }).first()).toBeVisible();
  await openCrmTab(page, 'My App', mobile);
  await page.getByRole('button', { name: /^Edit app(?: Unpublished changes)?$/ }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(appName).toHaveValue('Unsaved test name');
  expect(errors).toEqual([]);
});

test('documents recover from a failed request and late responses cannot replace the current tab', async ({ page }, testInfo) => {
  const mobile = Boolean(testInfo.project.use.isMobile);
  const suffix = testInfo.project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const tenantId = `e2e-tenant-${suffix}`;
  const { email } = await seedVerifiedOwner(testInfo.project.name);
  await mockAuthenticatedBackend(page, tenantId);
  await signIn(page, email);
  let attempt = 0;
  await page.route('**/admin/crm/documents?**', async (route) => {
    attempt += 1;
    await route.fulfill({
      status: attempt === 1 ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(attempt === 1
        ? { error: 'Temporary fixture outage', requestId: 'e2e-retry' }
        : { tenantId, documents: [], truncated: false, requestId: 'e2e-recovered' }),
    });
  });
  await openCrmTab(page, 'Documents', mobile);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('No documents yet', { exact: true })).toBeVisible();
  expect(attempt).toBe(2);

  await openCrmTab(page, 'Dashboard', mobile);
  let release: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/admin/crm/documents?**', async (route) => {
    await responseGate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tenantId, documents: [], truncated: false, requestId: 'e2e-delayed' }) });
  });
  await openCrmTab(page, 'Documents', mobile);
  await expect(page.getByText('Loading documents…', { exact: true })).toBeVisible();
  await openCrmTab(page, 'Events', mobile);
  release();
  await expect(page.getByText('Fixture Practice', { exact: true })).toBeVisible();
  await expect(page.getByText('No documents yet', { exact: true })).toHaveCount(0);
});
