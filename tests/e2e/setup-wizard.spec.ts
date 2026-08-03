import { expect, test } from '@playwright/test';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

test('admin entry routes accept bookmarked trailing slashes', async ({ page }) => {
  for (const route of ['/admin/', '/admin/setup/']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveTitle('404: Not Found');
  }

  await expect(
    page.getByRole('heading', { name: 'Set up your organization' }),
  ).toBeVisible();
});

test('setup validation advances without contacting external Firebase services', async ({
  context,
  page,
}) => {
  const externalRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith('http') && !loopbackHosts.has(url.hostname)) {
      externalRequests.push(url.origin);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  await page.goto('/admin/setup', { waitUntil: 'domcontentloaded' });

  await expect(
    page.getByRole('heading', { name: 'Set up your organization' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Program creation and administration are free. No payment method is required.',
    ),
  ).toBeVisible();
  await expect(page.locator('astro-island[client-render-time]')).toHaveCount(1);
  const continueButton = page.getByRole('button', { name: 'Continue' });
  await expect(continueButton).toBeDisabled();

  await page.getByPlaceholder('e.g., Elite Soccer Academy').fill('Fixture Athletics');
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(
    page.getByRole('heading', { name: 'Create your first team' }),
  ).toBeVisible();
  await page.getByLabel('Team Name').fill('Fixture U12');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(
    page.getByRole('heading', { name: 'Payments setup' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Payment processing is optional. Connect Stripe later only if your program chooses to collect participant fees.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Free setup does not connect a payment account or charge an activation fee.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Skip payment setup' }),
  ).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
