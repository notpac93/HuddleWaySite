import { routeMatchesNavigationDestination } from './app-preview-parity-contract.mjs';

export const PREVIEW_RENDER_TIMEOUT_MS = 30_000;
export const PREVIEW_ROUTE_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

export async function waitForRenderedPreview({
  readAccessibilityTree,
  expectedTenantMarker,
  navigationTabs,
  timeoutMs = PREVIEW_RENDER_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now,
  pause,
}) {
  const expectedLabels = navigationTabs.map((tab) => tab.label.toUpperCase());
  return pollForEvidence({
    description: `tenant marker ${JSON.stringify(expectedTenantMarker)} and preview navigation`,
    readEvidence: readAccessibilityTree,
    isReady: (tree) => (
      tree.includes(expectedTenantMarker)
      && expectedLabels.every((label) => tree.includes(label))
    ),
    timeoutMs,
    pollIntervalMs,
    now,
    pause,
  });
}

export async function waitForSelectedPreviewRoute({
  readRouteEvidence,
  tab,
  timeoutMs = PREVIEW_ROUTE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now,
  pause,
}) {
  const renderedLabel = tab.label.toUpperCase();
  const selectedPattern = new RegExp(
    `tab "${escapeRegExp(renderedLabel)}(?: ${escapeRegExp(renderedLabel)})?" \\[selected\\]`,
  );
  return pollForEvidence({
    description: `${renderedLabel} selected at ${tab.route}`,
    readEvidence: readRouteEvidence,
    isReady: ({ actualRoute, accessibilityTree }) => (
      routeMatchesNavigationDestination(tab.route, actualRoute)
      && selectedPattern.test(accessibilityTree)
    ),
    timeoutMs,
    pollIntervalMs,
    now,
    pause,
  });
}

async function pollForEvidence({
  description,
  readEvidence,
  isReady,
  timeoutMs,
  pollIntervalMs,
  now = Date.now,
  pause = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Preview readiness timeout must be a positive number.');
  }
  const startedAt = now();
  let latestEvidence;
  let latestReadError;

  while (true) {
    try {
      latestEvidence = await readEvidence();
      latestReadError = undefined;
      if (isReady(latestEvidence)) return latestEvidence;
    } catch (error) {
      latestReadError = error;
    }

    const elapsedMs = now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      const evidence = latestReadError
        ? `Last read error: ${String(latestReadError)}`
        : `Last evidence: ${summarizeEvidence(latestEvidence)}`;
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${description}. ${evidence}`,
      );
    }
    await pause(Math.min(pollIntervalMs, timeoutMs - elapsedMs));
  }
}

function summarizeEvidence(evidence) {
  const serialized = typeof evidence === 'string'
    ? evidence
    : JSON.stringify(evidence);
  return JSON.stringify(String(serialized).slice(0, 1500));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
