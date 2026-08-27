import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { acceptanceDigest } from '../../scripts/release/crm-external-evidence.mjs';
import {
  assertSafeArchiveEntry,
  inventoryDirectory,
  isPublicArtifact,
  isWarmCacheHit,
  parseMaxAge,
  probeCdnCandidate,
  publicPathForArtifact,
  recordRollback,
  stageDeployment,
  verifyDeploymentPlan,
} from '../../scripts/release/crm-production-deploy.mjs';

const WEBSITE_COMMIT = '1'.repeat(40);
const BACKEND_COMMIT = '2'.repeat(40);
const EVIDENCE_SHA256 = '3'.repeat(64);
const NOW = Date.parse('2026-07-27T03:00:00.000Z');
const temporaryDirectories: string[] = [];

function sha256(contents: Buffer | string) {
  return createHash('sha256').update(contents).digest('hex');
}

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'huddleway-production-deploy-test-'));
  temporaryDirectories.push(root);
  const target = join(root, 'static-target');
  const packageRoot = join(root, 'package');
  const releaseDirectory = join(packageRoot, '.release');
  const dist = join(packageRoot, 'dist');
  await mkdir(target, { recursive: true });
  await mkdir(join(target, '_astro'), { recursive: true });
  await writeFile(join(target, 'index.html'), '<h1>Rollback</h1>');
  await writeFile(join(target, '_astro', 'old.abcdef12.js'), 'old');
  run('git', ['init', '-b', 'porkbun-huddleway-static'], target);
  run('git', ['config', 'user.name', 'Release Test'], target);
  run('git', ['config', 'user.email', 'release-test@example.com'], target);
  run('git', ['add', '-A'], target);
  run('git', ['-c', 'commit.gpgsign=false', 'commit', '-m', 'rollback'], target);
  const rollbackRef = run('git', ['rev-parse', 'HEAD'], target);
  const rollbackInventory = await inventoryDirectory(target);

  await mkdir(join(dist, 'admin'), { recursive: true });
  await mkdir(join(dist, '_astro'), { recursive: true });
  await mkdir(join(dist, '.well-known'), { recursive: true });
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(join(dist, 'index.html'), '<h1>Accepted</h1>');
  await writeFile(join(dist, 'admin', 'index.html'), '<h1>Admin</h1>');
  await writeFile(join(dist, '_astro', 'app.abcdef12.js'), 'accepted');
  await writeFile(join(dist, '.well-known', 'security.txt'), 'Contact: test');
  const artifactInventory = await inventoryDirectory(dist);
  const manifest = {
    schemaVersion: 1,
    artifact: {
      format: 'astro-static-directory',
      root: 'dist',
      sha256: artifactInventory.sha256,
      files: artifactInventory.files,
      routes: ['/admin/'],
      quarantine: {
        nestedAppExcluded: true,
        staleCompiledCrmExcluded: true,
        consumerAppReferenced: false,
      },
    },
    source: {
      commit: WEBSITE_COMMIT,
      clean: true,
    },
    backendContract: {
      commit: BACKEND_COMMIT,
      clean: true,
    },
    environment: {
      id: 'production-candidate',
    },
  };
  const receiptBody = {
    schemaVersion: 1,
    status: 'accepted',
    acceptedAt: new Date(NOW - 60_000).toISOString(),
    release: {
      releaseId: 'release-2026-07-27',
      environment: 'production-candidate',
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      artifactSha256: artifactInventory.sha256,
    },
    externalEvidenceSha256: EVIDENCE_SHA256,
    gates: {
      backupRecovery: {},
      monitoring: {},
      appCheck: {},
      performance: {},
      releaseGovernance: {},
      deploymentApproval: {
        target: 'porkbun-huddleway-static',
        windowStartsAt: new Date(NOW - 60_000).toISOString(),
        windowEndsAt: new Date(NOW + 60 * 60_000).toISOString(),
        rollbackReleaseId: rollbackRef,
        rollbackArtifactSha256: rollbackInventory.sha256,
      },
    },
  };
  const receipt = {
    ...receiptBody,
    acceptanceSha256: acceptanceDigest(receiptBody),
  };
  await writeJson(join(releaseDirectory, 'crm-release-manifest.json'), manifest);
  await writeJson(
    join(releaseDirectory, 'crm-production-acceptance.json'),
    receipt,
  );
  const archive = join(root, 'crm-production-accepted.tar.gz');
  run(
    'tar',
    [
      '-czf',
      archive,
      'dist',
      '.release/crm-release-manifest.json',
      '.release/crm-production-acceptance.json',
    ],
    packageRoot,
  );
  return {
    root,
    target,
    archive,
    archiveSha256: sha256(await readFile(archive)),
    manifest,
    receipt,
    rollbackRef,
    rollbackInventory,
    artifactInventory,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true })),
  );
});

async function cdnProbeFixture({ includeVary = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'huddleway-cdn-probe-test-'));
  temporaryDirectories.push(root);
  const manifestPath = join(root, 'manifest.json');
  const outputPath = join(root, 'cdn-receipt.json');
  const assetBodies = new Map<string, Buffer>();
  const files = Array.from({ length: 3 }, (_, index) => {
    const path = `_astro/feature-${index}.abcdef1${index}.js`;
    const body = Buffer.alloc(5_000 + index, index + 1);
    assetBodies.set(`/${path}`, body);
    return {
      path,
      size: body.byteLength,
      sha256: sha256(body),
    };
  });
  await writeJson(manifestPath, {
    schemaVersion: 1,
    source: { commit: WEBSITE_COMMIT },
    artifact: {
      sha256: 'a'.repeat(64),
      files,
    },
  });
  const gzipCalls = new Map<string, number>();
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = assetBodies.get(url.pathname);
    if (!body) return responseFor(url, Buffer.from('missing'), 404);
    const requestHeaders = new Headers(init?.headers);
    const encoding = requestHeaders.get('accept-encoding');
    if (encoding === 'identity') return responseFor(url, body, 200);
    const headers = new Headers({
      'cache-control': 'public, max-age=31536000, immutable',
      'content-encoding': encoding || '',
      vary: includeVary ? 'Accept-Encoding' : 'Origin',
    });
    if (encoding === 'gzip') {
      const count = (gzipCalls.get(url.pathname) ?? 0) + 1;
      gzipCalls.set(url.pathname, count);
      headers.set('x-cache', count >= 2 ? 'HIT' : 'MISS');
    }
    return responseFor(url, Buffer.from('encoded'), 200, headers);
  }));
  return {
    manifestPath,
    outputPath,
    files,
  };
}

function responseFor(
  url: URL,
  body: Buffer,
  status: number,
  headers = new Headers(),
) {
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);
  const response = new Response(bytes.buffer, { status, headers });
  Object.defineProperty(response, 'url', { value: url.href });
  return response;
}

describe('CRM production artifact promotion', () => {
  it('stages only an accepted archive over its exact approved rollback tree', async () => {
    const value = await fixture();
    const outputPath = join(value.root, 'deployment-plan.json');
    const plan = await stageDeployment({
      archivePath: value.archive,
      acceptedArchiveSha256: value.archiveSha256,
      externalEvidenceSha256: EVIDENCE_SHA256,
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      targetDirectory: value.target,
      expectedRollbackRef: value.rollbackRef,
      deploymentId: 'github-run-12345678',
      outputPath,
      now: NOW,
    });

    expect(verifyDeploymentPlan(plan)).toEqual(plan);
    expect(plan.rollback.artifactSha256).toBe(value.rollbackInventory.sha256);
    expect(plan.release.artifactSha256).toBe(value.artifactInventory.sha256);
    expect(await inventoryDirectory(value.target)).toEqual(
      value.artifactInventory,
    );
    expect(
      await readFile(join(value.target, 'admin', 'index.html'), 'utf8'),
    ).toContain('Admin');
    await expect(readFile(join(value.target, '_astro', 'old.abcdef12.js')))
      .rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual(plan);
  });

  it('rejects archive, source, and rollback bindings before replacement', async () => {
    const badArchive = await fixture();
    await expect(stageDeployment({
      archivePath: badArchive.archive,
      acceptedArchiveSha256: '9'.repeat(64),
      externalEvidenceSha256: EVIDENCE_SHA256,
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      targetDirectory: badArchive.target,
      expectedRollbackRef: badArchive.rollbackRef,
      deploymentId: 'github-run-12345678',
      outputPath: join(badArchive.root, 'plan.json'),
      now: NOW,
    })).rejects.toThrow(/approved SHA-256/i);

    const badSource = await fixture();
    await expect(stageDeployment({
      archivePath: badSource.archive,
      acceptedArchiveSha256: badSource.archiveSha256,
      externalEvidenceSha256: EVIDENCE_SHA256,
      websiteCommit: '8'.repeat(40),
      backendCommit: BACKEND_COMMIT,
      targetDirectory: badSource.target,
      expectedRollbackRef: badSource.rollbackRef,
      deploymentId: 'github-run-12345678',
      outputPath: join(badSource.root, 'plan.json'),
      now: NOW,
    })).rejects.toThrow(/website commit/i);

    const expired = await fixture();
    await expect(stageDeployment({
      archivePath: expired.archive,
      acceptedArchiveSha256: expired.archiveSha256,
      externalEvidenceSha256: EVIDENCE_SHA256,
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      targetDirectory: expired.target,
      expectedRollbackRef: expired.rollbackRef,
      deploymentId: 'github-run-12345678',
      outputPath: join(expired.root, 'plan.json'),
      now: NOW + 2 * 60 * 60_000,
    })).rejects.toThrow(/expired/i);
  });

  it('records a checksummed automatic rollback without claiming success', async () => {
    const value = await fixture();
    const planPath = join(value.root, 'deployment-plan.json');
    await stageDeployment({
      archivePath: value.archive,
      acceptedArchiveSha256: value.archiveSha256,
      externalEvidenceSha256: EVIDENCE_SHA256,
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      targetDirectory: value.target,
      expectedRollbackRef: value.rollbackRef,
      deploymentId: 'github-run-12345678',
      outputPath: planPath,
      now: NOW,
    });
    const receipt = await recordRollback({
      planPath,
      failedDeployedCommit: '4'.repeat(40),
      rollbackCommit: '5'.repeat(40),
      outputPath: join(value.root, 'rollback.json'),
      now: NOW + 1_000,
    });

    expect(receipt.status).toBe('rolled-back');
    expect(receipt.restoredSourceCommit).toBe(value.rollbackRef);
    expect(receipt.rollbackSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects traversal, links public routes, and enforces immutable warm-cache semantics', () => {
    expect(() => assertSafeArchiveEntry('../outside')).toThrow(/escapes/i);
    expect(() => assertSafeArchiveEntry('/absolute')).toThrow(/absolute/i);
    expect(() => assertSafeArchiveEntry('dist\\escape')).toThrow(/separator/i);
    expect(() => assertSafeArchiveEntry('private/receipt.json')).toThrow(
      /unexpected/i,
    );
    expect(publicPathForArtifact('index.html')).toBe('/');
    expect(publicPathForArtifact('admin/index.html')).toBe('/admin/');
    expect(publicPathForArtifact('_astro/app.abcdef12.js')).toBe(
      '/_astro/app.abcdef12.js',
    );
    expect(isPublicArtifact('.well-known/security.txt')).toBe(true);
    expect(isPublicArtifact('mockups/.gitkeep')).toBe(false);
    expect(parseMaxAge('public, max-age=31536000, immutable')).toBe(31_536_000);
    expect(parseMaxAge('public')).toBe(-1);
    expect(isWarmCacheHit(new Headers({ 'x-cache': 'Hit from cloudfront' })))
      .toBe(true);
    expect(isWarmCacheHit(new Headers({ age: '12' }))).toBe(true);
    expect(isWarmCacheHit(new Headers({ 'x-cache': 'MISS' }))).toBe(false);
  });

  it('probes three exact candidate assets before deployment and writes a bounded receipt', async () => {
    const value = await cdnProbeFixture();
    const receipt = await probeCdnCandidate({
      manifestPath: value.manifestPath,
      origin: 'https://canary.huddleway.com',
      outputPath: value.outputPath,
      now: NOW,
    });

    expect(receipt).toMatchObject({
      schemaVersion: 1,
      status: 'verified',
      probeOnly: true,
      origin: 'https://canary.huddleway.com',
      websiteCommit: WEBSITE_COMMIT,
      artifactSha256: 'a'.repeat(64),
    });
    expect(receipt.assets).toHaveLength(3);
    expect(receipt.assets.every((asset) => asset.brotliEncoding === 'br'))
      .toBe(true);
    expect(receipt.assets.every((asset) => asset.gzipEncoding === 'gzip'))
      .toBe(true);
    expect(receipt.assets.every((asset) => asset.warmCacheStatus === 'HIT'))
      .toBe(true);
    expect(receipt.cdnProbeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(value.outputPath, 'utf8'))).toEqual(
      receipt,
    );
  });

  it('fails the canary probe when compressed variants omit Vary', async () => {
    const value = await cdnProbeFixture({ includeVary: false });
    await expect(probeCdnCandidate({
      manifestPath: value.manifestPath,
      origin: 'https://canary.huddleway.com',
      outputPath: value.outputPath,
      now: NOW,
    })).rejects.toThrow(/does not vary on Accept-Encoding/i);
  });

  it('pins the lightweight single-developer deployment path', async () => {
    const workflow = await readFile(
      resolve('.github/workflows/crm-production-deploy.yml'),
      'utf8',
    );
    expect(workflow).toContain('environment:\n      name: crm-production-deployment');
    expect(workflow).toContain('name: CRM single-developer production deployment');
    expect(workflow).toContain('crm-single-developer-deploy.mjs stage');
    expect(workflow).toContain('crm-single-developer-deploy.mjs verify-live');
    expect(workflow).not.toContain('CRM_EXTERNAL_RELEASE_EVIDENCE_JSON');
    expect(workflow).not.toContain('actions/download-artifact');
    expect(workflow).not.toContain('--signer-workflow');
    expect(workflow).toContain(
      'git -C "$STATIC_TARGET_DIR" push origin HEAD:refs/heads/porkbun-huddleway-static',
    );
    expect(workflow).not.toContain('git push --force');
  });

  it('keeps the owner-operated path artifact-bound, explicitly approved, and rollback-capable', async () => {
    const workflow = await readFile(
      resolve('.github/workflows/crm-owner-production-deploy.yml'),
      'utf8',
    );

    expect(workflow).toContain('APPROVE_OWNER_PRODUCTION_DEPLOYMENT');
    expect(workflow).toContain('crm-release-${{ inputs.website_ref }}');
    expect(workflow).toContain('Manifest source commit does not match website_ref.');
    expect(workflow).toContain('Artifact manifest mismatch: ${path}');
    expect(workflow).toContain('Production static branch changed after owner approval.');
    expect(workflow).toContain("rsync -a --delete --exclude='.git/'");
    expect(workflow).toContain('verified_existing_artifact');
    expect(workflow).toContain('The exact release artifact is already present on the production branch.');
    expect(workflow).toContain('git -C "$STATIC_TARGET_DIR" revert --no-edit "$DEPLOYED_COMMIT"');
    expect(workflow).toContain('Rollback did not restore the prior live admin artifact.');
    expect(workflow).not.toContain('git push --force');
  });

  it('retains every manifest-tracked public file in the release artifact', async () => {
    const releaseGate = await readFile(
      resolve('.github/workflows/crm-release-gate.yml'),
      'utf8',
    );

    expect(releaseGate).toContain('include-hidden-files: true');
    expect(releaseGate).toContain('dist/');
    expect(releaseGate).toContain('.release/crm-release-manifest.json');
  });
});
