import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_PARITY_CONTRACTS,
  buildConsumerPreviewUrl,
  fetchAttestedConsumerRelease,
  fetchPortalPreviewAttestation,
  parsePreviewParityOptions,
  previewProbeConfiguration,
  previewProbeMessage,
  routeMatchesNavigationDestination,
  validateConsumerReleaseManifest,
  verifyConsumerBundleBytes,
} from '../../scripts/preview-parity/app-preview-parity-contract.mjs';

const sourceCommit = 'a'.repeat(40);
const bundle = Buffer.from('compiled consumer bytes');
const mainBundleSha256 = createHash('sha256').update(bundle).digest('hex');

function stageOptions() {
  return parsePreviewParityOptions(['--environment', 'stage'], {
    APP_PREVIEW_EXPECTED_SOURCE_COMMIT: sourceCommit,
    APP_PREVIEW_EXPECTED_RELEASE_ID: 'consumer-stage-aaaaaaaaaaaa',
  });
}

function prodOptions() {
  return parsePreviewParityOptions(['--environment', 'prod'], {
    APP_PREVIEW_EXPECTED_SOURCE_COMMIT: sourceCommit,
    APP_PREVIEW_EXPECTED_RELEASE_ID: 'consumer-prod-aaaaaaaaaaaa',
    APP_PREVIEW_EXPECTED_ARTIFACT_SHA256: mainBundleSha256,
  });
}

function stageManifest() {
  return {
    schemaVersion: 1,
    audience: 'consumer',
    environment: 'stage',
    firebaseProjectId: 'huddleway-dev',
    entrypoint: 'lib/main_consumer.dart',
    sourceCommit,
    releaseId: 'consumer-stage-aaaaaaaaaaaa',
    mainBundleSha256,
  };
}

describe('deployed app preview parity contract', () => {
  it('binds stage and production to different canonical origins and projects', () => {
    expect(PREVIEW_PARITY_CONTRACTS.stage).toMatchObject({
      parentOrigin: 'https://huddleway-crm-canary.web.app',
      previewOrigin: 'https://huddleway-app-preview-canary.web.app',
      firebaseProjectId: 'huddleway-dev',
    });
    expect(PREVIEW_PARITY_CONTRACTS.prod).toMatchObject({
      parentOrigin: 'https://huddleway.com',
      previewOrigin: 'https://huddleway-app-preview-prod.web.app',
      firebaseProjectId: 'sports-team-apps',
    });
  });

  it('requires an explicit approved consumer commit and environment release', () => {
    expect(() => parsePreviewParityOptions(['--environment', 'stage'], {}))
      .toThrow(/exact 40-character consumer commit/i);
    expect(() => parsePreviewParityOptions(['--environment', 'prod'], {
      APP_PREVIEW_EXPECTED_SOURCE_COMMIT: sourceCommit,
      APP_PREVIEW_EXPECTED_RELEASE_ID: 'consumer-stage-aaaaaaaaaaaa',
    })).toThrow(/prod consumer release/i);
    expect(() => parsePreviewParityOptions(['--environment', 'prod'], {
      APP_PREVIEW_EXPECTED_SOURCE_COMMIT: sourceCommit,
      APP_PREVIEW_EXPECTED_RELEASE_ID: 'consumer-prod-aaaaaaaaaaaa',
    })).toThrow(/exact consumer bundle SHA-256/i);
    expect(() => parsePreviewParityOptions([
      '--environment', 'stage', '--tenant', 'another-tenant',
    ], {
      APP_PREVIEW_EXPECTED_SOURCE_COMMIT: sourceCommit,
      APP_PREVIEW_EXPECTED_RELEASE_ID: 'consumer-stage-aaaaaaaaaaaa',
    })).toThrow(/expected-tenant-marker/i);
  });

  it('requires production to match the separately attested bundle hash', () => {
    const options = parsePreviewParityOptions(['--environment', 'prod'], {
      APP_PREVIEW_EXPECTED_SOURCE_COMMIT: sourceCommit,
      APP_PREVIEW_EXPECTED_RELEASE_ID: 'consumer-prod-aaaaaaaaaaaa',
      APP_PREVIEW_EXPECTED_ARTIFACT_SHA256: 'b'.repeat(64),
    });
    expect(() => validateConsumerReleaseManifest({
      ...stageManifest(),
      environment: 'prod',
      firebaseProjectId: 'sports-team-apps',
      releaseId: 'consumer-prod-aaaaaaaaaaaa',
    }, options)).toThrow(/mainBundleSha256 mismatch/i);
  });

  it('rejects a manifest from the wrong environment, project, entrypoint, or release', () => {
    const options = stageOptions();
    for (const mutation of [
      { environment: 'prod' },
      { firebaseProjectId: 'sports-team-apps' },
      { entrypoint: 'lib/main_admin.dart' },
      { sourceCommit: 'b'.repeat(40) },
      { releaseId: 'consumer-stage-bbbbbbbbbbbb' },
    ]) {
      expect(() => validateConsumerReleaseManifest(
        { ...stageManifest(), ...mutation },
        options,
      )).toThrow(/mismatch/i);
    }
  });

  it('hashes the downloaded main bundle and rejects changed bytes', () => {
    expect(verifyConsumerBundleBytes(bundle, stageManifest()))
      .toBe(mainBundleSha256);
    expect(() => verifyConsumerBundleBytes(Buffer.from('changed'), stageManifest()))
      .toThrow(/bundle hash mismatch/i);
  });

  it('fetches and verifies both immutable deployed resources', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(stageManifest())))
      .mockResolvedValueOnce(new Response(bundle));
    const result = await fetchAttestedConsumerRelease(stageOptions(), fetchImpl);
    expect(result.bundleHash).toBe(mainBundleSha256);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toContain('/.well-known/huddleway-consumer-release.json');
    expect(fetchImpl.mock.calls[1][0]).toContain('/main.dart.js');
    expect(fetchImpl.mock.calls[0][1]).toEqual({ cache: 'no-store' });
  });

  it('fails closed when a hosting rewrite serves the app shell instead of a manifest', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('<!doctype html><title>Consumer app</title>'),
    );
    await expect(fetchAttestedConsumerRelease(stageOptions(), fetchImpl))
      .rejects.toThrow(/not valid JSON.*not an attested release/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('crawls the deployed portal and proves its compiled consumer attestation', async () => {
    const responses = new Map([
      ['https://huddleway-crm-canary.web.app/admin/',
        '<script src="/_astro/portal.js"></script>'],
      ['https://huddleway-crm-canary.web.app/_astro/portal.js',
        'import("./my-app.js")'],
      ['https://huddleway-crm-canary.web.app/_astro/my-app.js',
        'import "./environment.js"'],
      ['https://huddleway-crm-canary.web.app/_astro/environment.js', [
        'https://huddleway-app-preview-canary.web.app',
        sourceCommit,
        'consumer-stage-aaaaaaaaaaaa',
        'PUBLIC_APP_PREVIEW_ENVIRONMENT:"stage"',
        'PUBLIC_FIREBASE_PROJECT_ID:"huddleway-dev"',
      ].join('|')],
    ]);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const contents = responses.get(String(input));
      return contents === undefined
        ? new Response('missing', { status: 404 })
        : new Response(contents);
    });
    const evidence = await fetchPortalPreviewAttestation(stageOptions(), fetchImpl);
    expect(evidence.resourceCount).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('attests the fixed production Firebase runtime without a public override', async () => {
    const responses = new Map([
      ['https://huddleway.com/admin/', '<script src="/_astro/portal.js"></script>'],
      ['https://huddleway.com/_astro/portal.js', [
        'https://huddleway-app-preview-prod.web.app',
        sourceCommit,
        'consumer-prod-aaaaaaaaaaaa',
        'PUBLIC_APP_PREVIEW_ENVIRONMENT:"prod"',
        'projectId:"sports-team-apps"',
      ].join('|')],
    ]);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const contents = responses.get(String(input));
      return contents === undefined
        ? new Response('missing', { status: 404 })
        : new Response(contents);
    });
    const evidence = await fetchPortalPreviewAttestation(prodOptions(), fetchImpl);
    expect(evidence.resourceCount).toBe(2);
  });

  it('rejects a portal compiled for a different consumer release', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      '<script>PUBLIC_APP_PREVIEW_ENVIRONMENT:"stage"</script>',
    ));
    await expect(fetchPortalPreviewAttestation(stageOptions(), fetchImpl))
      .rejects.toThrow(/does not attest.*consumer release marker/i);
  });

  it('builds one exact-origin session and a valid five-route draft', () => {
    const options = stageOptions();
    const session = { sessionId: 'session-1', nonce: 'nonce-1' };
    const url = new URL(buildConsumerPreviewUrl(options, session));
    expect(url.origin).toBe(options.contract.previewOrigin);
    expect(url.searchParams.get('parentOrigin')).toBe(options.contract.parentOrigin);
    expect(url.searchParams.get('forcedTenant')).toBe('stem-it-up-sports');
    expect(options.expectedTenantMarker).toBe('STEM It Up Sports');
    const configuration = previewProbeConfiguration('stage');
    const message = previewProbeMessage(options, session, configuration);
    expect(message).toMatchObject({
      type: 'huddleway.crm.preview.update',
      protocolVersion: 1,
      environment: 'stage',
      revision: 1,
    });
    expect(configuration.navigationTabs.map((tab) => tab.route)).toEqual([
      '/', '/teams', '/schedule', '/messaging', '/events',
    ]);
    expect(configuration.navigationTabs.map((tab) => tab.label)).toEqual([
      'HProbe', 'TProbe', 'SProbe', 'BProbe', 'EProbe',
    ]);
  });

  it('accepts a resolved single-team route only for the Teams destination', () => {
    expect(routeMatchesNavigationDestination('/teams', '/team-esports')).toBe(true);
    expect(routeMatchesNavigationDestination('/teams', '/schedule')).toBe(false);
    expect(routeMatchesNavigationDestination('/schedule', '/team-esports')).toBe(false);
  });
});
