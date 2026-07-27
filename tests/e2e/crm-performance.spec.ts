import { expect, test } from '@playwright/test';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const cwvBudgets = {
  lcp: 2_500,
  inp: 200,
  cls: 0.1,
};

test('setup route stays within local desktop/mobile rendering budgets', async ({
  context,
  page,
}, testInfo) => {
  const blockedExternalRequests: string[] = [];
  const externalResponses: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.protocol.startsWith('http') && !loopbackHosts.has(url.hostname)) {
      externalResponses.push(url.origin);
    }
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith('http') && !loopbackHosts.has(url.hostname)) {
      blockedExternalRequests.push(url.origin);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  await page.addInitScript(() => {
    const metrics = {
      lcp: 0,
      inp: 0,
      cls: 0,
      longTaskCount: 0,
    };
    Object.defineProperty(window, '__huddlewayPerformance', {
      value: metrics,
      configurable: false,
    });

    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries.at(-1);
      if (lastEntry) metrics.lcp = lastEntry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { hadRecentInput?: boolean; value?: number }
      >) {
        if (!entry.hadRecentInput) metrics.cls += entry.value ?? 0;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { duration: number; interactionId?: number }
      >) {
        if (entry.interactionId) metrics.inp = Math.max(metrics.inp, entry.duration);
      }
    }).observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);

    new PerformanceObserver((list) => {
      metrics.longTaskCount += list.getEntries().length;
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto('/admin/setup', { waitUntil: 'networkidle' });
  await expect(
    page.getByRole('heading', { name: 'Set up your organization' }),
  ).toBeVisible();

  const continueButton = page.getByRole('button', { name: 'Continue' });
  await page.getByPlaceholder('e.g., Elite Soccer Academy').fill(
    'Fixture Athletics',
  );
  await continueButton.click();
  await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible();
  await page.waitForTimeout(100);

  const evidence = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      'navigation',
    )[0] as PerformanceNavigationTiming;
    const firstContentfulPaint =
      performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const metrics = (
      window as unknown as Window & {
        __huddlewayPerformance: {
          lcp: number;
          inp: number;
          cls: number;
          longTaskCount: number;
        };
      }
    ).__huddlewayPerformance;
    return {
      ...metrics,
      firstContentfulPaint,
      domContentLoaded: navigation.domContentLoadedEventEnd,
      horizontalOverflow:
        document.documentElement.scrollWidth
        - document.documentElement.clientWidth,
    };
  });
  console.log(JSON.stringify({
    project: testInfo.project.name,
    ...evidence,
    blockedExternalRequestCount: blockedExternalRequests.length,
  }));

  expect(evidence.firstContentfulPaint).toBeGreaterThan(0);
  expect(evidence.lcp).toBeLessThanOrEqual(cwvBudgets.lcp);
  expect(evidence.inp).toBeLessThanOrEqual(cwvBudgets.inp);
  expect(evidence.cls).toBeLessThanOrEqual(cwvBudgets.cls);
  expect(evidence.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(externalResponses).toEqual([]);
  expect(blockedExternalRequests.length).toBeLessThanOrEqual(4);
});
