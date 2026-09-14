import { chromium } from '@playwright/test';

import {
  waitForRenderedPreview,
  waitForSelectedPreviewRoute,
} from './preview-parity/app-preview-browser-readiness.mjs';
import { previewParityHarnessHtml } from './preview-parity/app-preview-parity-harness.mjs';
import {
  buildConsumerPreviewUrl,
  createPreviewProbeSession,
  fetchAttestedConsumerRelease,
  fetchPortalPreviewAttestation,
  parsePreviewParityOptions,
  previewProbeConfiguration,
  previewProbeMessage,
} from './preview-parity/app-preview-parity-contract.mjs';

const options = parsePreviewParityOptions(process.argv.slice(2));
const portal = await fetchPortalPreviewAttestation(options);
const release = await fetchAttestedConsumerRelease(options);
const session = createPreviewProbeSession();
const configuration = previewProbeConfiguration(options.contract.environment);
const previewUrl = buildConsumerPreviewUrl(options, session);
const update = previewProbeMessage(options, session, configuration);
const harnessPath = '/__huddleway-preview-parity-probe__';
const harnessUrl = `${options.contract.parentOrigin}${harnessPath}`;
const browser = await chromium.launch({ headless: options.headless });

try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route(`${harnessUrl}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      headers: {
        'cache-control': 'no-store',
        'content-security-policy': [
          "default-src 'none'",
          `frame-src ${options.contract.previewOrigin}`,
          "script-src 'unsafe-inline'",
          "style-src 'unsafe-inline'",
        ].join('; '),
      },
      body: previewParityHarnessHtml({
        options,
        previewUrl,
        session,
        update,
      }),
    });
  });

  await page.goto(harnessUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => ['synced', 'error'].includes(
      document.documentElement.dataset.previewState || '',
    ),
    null,
    { timeout: 45_000 },
  );
  const handshakeEvidence = await page.evaluate(
    () => globalThis.__previewEvidence,
  );
  if (handshakeEvidence?.status !== 'synced') {
    throw new Error(
      `Consumer preview handshake failed: ${String(handshakeEvidence?.reason || 'unknown')}.`,
    );
  }

  const frame = page.frames().find(
    (candidate) => candidate.url().startsWith(options.contract.previewOrigin),
  );
  if (!frame) throw new Error('The consumer preview iframe did not load.');

  const semanticsPlaceholder = frame.locator('flt-semantics-placeholder');
  if (await semanticsPlaceholder.count()) {
    await semanticsPlaceholder.focus();
    await semanticsPlaceholder.press('Enter');
  }
  await waitForRenderedPreview({
    readAccessibilityTree: () => frame.locator('body').ariaSnapshot(),
    expectedTenantMarker: options.expectedTenantMarker,
    navigationTabs: configuration.navigationTabs,
  });
  const routeEvidence = [];
  const routeSequence = [
    ...configuration.navigationTabs.slice(1),
    configuration.navigationTabs[0],
  ];
  for (const tab of routeSequence) {
    const renderedLabel = tab.label.toUpperCase();
    const destination = frame.getByRole('tab', {
      name: renderedLabel,
      exact: true,
    });
    await destination.click();
    const selected = await waitForSelectedPreviewRoute({
      readRouteEvidence: async () => ({
        actualRoute: previewRoute(frame.url()),
        accessibilityTree: await frame.locator('body').ariaSnapshot(),
      }),
      tab,
    });
    routeEvidence.push({
      label: renderedLabel,
      configuredRoute: tab.route,
      actualRoute: selected.actualRoute,
    });
  }

  process.stdout.write(`${JSON.stringify({
    status: 'accepted',
    environment: options.contract.environment,
    tenantId: options.tenantId,
    parentOrigin: options.contract.parentOrigin,
    previewOrigin: options.contract.previewOrigin,
    portalResourcesChecked: portal.resourceCount,
    sourceCommit: release.manifest.sourceCommit,
    releaseId: release.manifest.releaseId,
    mainBundleSha256: release.bundleHash,
    protocolVersion: 1,
    renderedTenantMarker: options.expectedTenantMarker || null,
    appliedDraftName: configuration.name,
    routeEvidence,
    browserEvidence: handshakeEvidence,
  }, null, 2)}\n`);
} finally {
  await browser.close();
}

function previewRoute(frameUrl) {
  const currentUrl = new URL(frameUrl);
  return currentUrl.hash.startsWith('#/')
    ? currentUrl.hash.slice(1).split('?')[0]
    : currentUrl.pathname;
}
