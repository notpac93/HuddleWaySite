import { createHash, randomUUID } from 'node:crypto';

export const PREVIEW_PARITY_CONTRACTS = Object.freeze({
  stage: Object.freeze({
    environment: 'stage',
    parentOrigin: 'https://huddleway-crm-canary.web.app',
    previewOrigin: 'https://huddleway-app-preview-canary.web.app',
    firebaseProjectId: 'huddleway-dev',
    releasePrefix: 'consumer-stage-',
  }),
  prod: Object.freeze({
    environment: 'prod',
    parentOrigin: 'https://huddleway.com',
    previewOrigin: 'https://huddleway-app-preview-prod.web.app',
    firebaseProjectId: 'sports-team-apps',
    releasePrefix: 'consumer-prod-',
  }),
});

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const BUNDLE_SHA_PATTERN = /^[a-f0-9]{64}$/;

export function parsePreviewParityOptions(
  argv,
  operatorEnvironment = process.env,
) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const [name, inlineValue] = argument.slice(2).split('=', 2);
    const value = inlineValue ?? argv[index + 1];
    if (!inlineValue) index += 1;
    if (!value || value.startsWith('--')) {
      throw new Error(`--${name} requires a value.`);
    }
    values.set(name, value.trim());
  }

  const environment = String(values.get('environment') || '').toLowerCase();
  const contract = PREVIEW_PARITY_CONTRACTS[environment];
  if (!contract) {
    throw new Error('--environment must be stage or prod.');
  }
  const tenantId = values.get('tenant') || 'stem-it-up-sports';
  if (!/^[a-z0-9][a-z0-9_-]{1,127}$/.test(tenantId)) {
    throw new Error('--tenant must be a normalized public tenant identifier.');
  }
  const expectedSourceCommit = String(
    values.get('expected-source-commit')
      || operatorEnvironment.APP_PREVIEW_EXPECTED_SOURCE_COMMIT
      || '',
  ).toLowerCase();
  if (!SHA_PATTERN.test(expectedSourceCommit)) {
    throw new Error(
      'APP_PREVIEW_EXPECTED_SOURCE_COMMIT (or --expected-source-commit) must be the exact 40-character consumer commit.',
    );
  }
  const expectedReleaseId = String(
    values.get('expected-release-id')
      || operatorEnvironment.APP_PREVIEW_EXPECTED_RELEASE_ID
      || '',
  );
  if (
    !expectedReleaseId.startsWith(contract.releasePrefix)
    || expectedReleaseId.length <= contract.releasePrefix.length
  ) {
    throw new Error(
      `APP_PREVIEW_EXPECTED_RELEASE_ID must identify a ${environment} consumer release.`,
    );
  }
  const expectedArtifactSha256 = String(
    values.get('expected-artifact-sha256')
      || operatorEnvironment.APP_PREVIEW_EXPECTED_ARTIFACT_SHA256
      || '',
  ).toLowerCase();
  if (
    (environment === 'prod' || expectedArtifactSha256)
    && !BUNDLE_SHA_PATTERN.test(expectedArtifactSha256)
  ) {
    throw new Error(
      'APP_PREVIEW_EXPECTED_ARTIFACT_SHA256 (or --expected-artifact-sha256) must be the exact consumer bundle SHA-256.',
    );
  }
  const expectedTenantMarker = values.get('expected-tenant-marker')
    || (tenantId === 'stem-it-up-sports' ? 'STEM It Up Sports' : '');
  if (!expectedTenantMarker) {
    throw new Error(
      '--expected-tenant-marker is required when probing a tenant other than stem-it-up-sports.',
    );
  }
  return {
    contract,
    tenantId,
    expectedTenantMarker,
    expectedSourceCommit,
    expectedReleaseId,
    expectedArtifactSha256,
    headless: operatorEnvironment.PLAYWRIGHT_HEADLESS !== 'false',
  };
}

export function validateConsumerReleaseManifest(
  manifest,
  {
    contract,
    expectedSourceCommit,
    expectedReleaseId,
    expectedArtifactSha256,
  },
) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Consumer release manifest is not an object.');
  }
  const expected = {
    schemaVersion: 1,
    audience: 'consumer',
    environment: contract.environment,
    firebaseProjectId: contract.firebaseProjectId,
    entrypoint: 'lib/main_consumer.dart',
    sourceCommit: expectedSourceCommit,
    releaseId: expectedReleaseId,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (manifest[field] !== value) {
      throw new Error(
        `Consumer release manifest ${field} mismatch: expected ${value}, received ${String(manifest[field])}.`,
      );
    }
  }
  if (!BUNDLE_SHA_PATTERN.test(String(manifest.mainBundleSha256 || ''))) {
    throw new Error('Consumer release manifest has an invalid main bundle SHA-256.');
  }
  if (
    expectedArtifactSha256
    && manifest.mainBundleSha256 !== expectedArtifactSha256
  ) {
    throw new Error(
      `Consumer release manifest mainBundleSha256 mismatch: expected ${expectedArtifactSha256}, received ${String(manifest.mainBundleSha256)}.`,
    );
  }
  return manifest;
}

export function verifyConsumerBundleBytes(bundle, manifest) {
  const actual = createHash('sha256').update(bundle).digest('hex');
  if (actual !== manifest.mainBundleSha256) {
    throw new Error(
      `Consumer main bundle hash mismatch: expected ${manifest.mainBundleSha256}, received ${actual}.`,
    );
  }
  return actual;
}

export async function fetchAttestedConsumerRelease(options, fetchImpl = fetch) {
  const cacheBuster = encodeURIComponent(randomUUID());
  const manifestUrl = `${options.contract.previewOrigin}/.well-known/huddleway-consumer-release.json?parity=${cacheBuster}`;
  const manifestResponse = await fetchImpl(manifestUrl, { cache: 'no-store' });
  if (!manifestResponse.ok) {
    throw new Error(
      `Consumer release manifest request failed with ${manifestResponse.status}.`,
    );
  }
  let decodedManifest;
  try {
    decodedManifest = await manifestResponse.json();
  } catch {
    throw new Error(
      'Consumer release manifest is not valid JSON; the preview host is not an attested release.',
    );
  }
  const manifest = validateConsumerReleaseManifest(
    decodedManifest,
    options,
  );
  const bundleResponse = await fetchImpl(
    `${options.contract.previewOrigin}/main.dart.js?parity=${cacheBuster}`,
    { cache: 'no-store' },
  );
  if (!bundleResponse.ok) {
    throw new Error(`Consumer main bundle request failed with ${bundleResponse.status}.`);
  }
  const bundleHash = verifyConsumerBundleBytes(
    Buffer.from(await bundleResponse.arrayBuffer()),
    manifest,
  );
  return { manifest, bundleHash };
}

export async function fetchPortalPreviewAttestation(
  options,
  fetchImpl = fetch,
) {
  const entryUrl = new URL('/admin/', options.contract.parentOrigin).toString();
  const pending = [entryUrl];
  const visited = new Set();
  const artifacts = [];
  let totalBytes = 0;

  while (pending.length > 0) {
    const artifactUrl = pending.shift();
    if (visited.has(artifactUrl)) continue;
    visited.add(artifactUrl);
    if (visited.size > 75) {
      throw new Error('Portal attestation dependency graph exceeded 75 resources.');
    }
    const response = await fetchImpl(artifactUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        `Portal attestation resource failed with ${response.status}: ${artifactUrl}`,
      );
    }
    const contents = await response.text();
    totalBytes += Buffer.byteLength(contents);
    if (totalBytes > 15 * 1024 * 1024) {
      throw new Error('Portal attestation dependency graph exceeded 15 MiB.');
    }
    artifacts.push(contents);
    for (const reference of javascriptReferences(contents)) {
      const dependency = new URL(reference, artifactUrl);
      if (
        dependency.origin === options.contract.parentOrigin
        && dependency.pathname.endsWith('.js')
        && !visited.has(dependency.toString())
      ) pending.push(dependency.toString());
    }
  }

  const compiledPortal = artifacts.join('\n');
  const requiredMarkers = [
    options.contract.previewOrigin,
    options.expectedSourceCommit,
    options.expectedReleaseId,
    `PUBLIC_APP_PREVIEW_ENVIRONMENT:"${options.contract.environment}"`,
    `PUBLIC_FIREBASE_PROJECT_ID:"${options.contract.firebaseProjectId}"`,
  ];
  for (const marker of requiredMarkers) {
    if (!compiledPortal.includes(marker)) {
      throw new Error(
        `The deployed portal does not attest the selected consumer release marker: ${marker}.`,
      );
    }
  }
  return {
    entryUrl,
    resourceCount: visited.size,
    byteCount: totalBytes,
  };
}

function javascriptReferences(contents) {
  const references = new Set();
  const pattern = /["'(]((?:\.{1,2}\/|\/)[A-Za-z0-9_./-]+\.js)["')]/g;
  for (const match of contents.matchAll(pattern)) references.add(match[1]);
  return references;
}

export function createPreviewProbeSession() {
  return {
    sessionId: randomUUID(),
    nonce: randomUUID(),
  };
}

export function previewProbeConfiguration(environment) {
  return {
    name: `HuddleWay ${environment} parity probe`,
    primaryColor: '#0F4C81',
    secondaryColor: '#245BD6',
    tertiaryColor: '#F59E0B',
    logoUrl: '',
    navigationTabs: [
      { key: 'home', pageId: 'home_page', route: '/', label: 'HProbe', enabled: true },
      { key: 'teams', pageId: 'teams_page', route: '/teams', label: 'TProbe', enabled: true },
      { key: 'schedule', pageId: 'schedule_page', route: '/schedule', label: 'SProbe', enabled: true },
      { key: 'messaging', pageId: 'board_page', route: '/messaging', label: 'BProbe', enabled: true },
      { key: 'events', pageId: 'events_page', route: '/events', label: 'EProbe', enabled: true },
    ],
  };
}

export function buildConsumerPreviewUrl(options, session) {
  const url = new URL('/', options.contract.previewOrigin);
  url.searchParams.set('crmPreview', '1');
  url.searchParams.set('forcedTenant', options.tenantId);
  url.searchParams.set('parentOrigin', options.contract.parentOrigin);
  url.searchParams.set('previewSession', session.sessionId);
  url.searchParams.set('previewNonce', session.nonce);
  return url.toString();
}

export function previewProbeMessage(options, session, configuration) {
  return {
    type: 'huddleway.crm.preview.update',
    protocolVersion: 1,
    tenantId: options.tenantId,
    environment: options.contract.environment,
    sessionId: session.sessionId,
    nonce: session.nonce,
    revision: 1,
    configuration,
  };
}

export function routeMatchesNavigationDestination(expectedRoute, actualRoute) {
  return actualRoute === expectedRoute
    || (expectedRoute === '/teams' && /^\/team-[a-z0-9-]+$/.test(actualRoute));
}
