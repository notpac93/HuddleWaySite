import { expect, test, type Page } from '@playwright/test';

const projectId = 'demo-huddleway-crm';
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
    page.getByRole('heading', { name: 'Admin Portal' }),
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
  if (mobile) {
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Fixture Athletics' });
    await drawer.getByRole('button', { name: visibleLabel, exact: true }).click();
    await expect(drawer).toBeHidden();
  } else {
    const sidebar = page.locator('aside');
    await sidebar.hover();
    await sidebar.locator('nav').getByRole('button', {
      name: visibleLabel,
      exact: true,
    }).click();
  }

  await expect(
    page.locator('header.crm-ui-shell-header').getByText(visibleLabel, { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('main span.sr-only').filter({ hasText: `Loading ${tab}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Module unavailable' }),
  ).toHaveCount(0);
}

test('verified owner can use the authenticated CRM shell by keyboard and mobile navigation', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name.includes('mobile');
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

  for (const tab of crmTabs) await openCrmTab(page, tab, mobile);

  const horizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth
      - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
