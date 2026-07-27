#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCEPTED_TARGET,
  acceptanceDigest,
  verifyAcceptanceReceipt,
} from './crm-external-evidence.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const ACCEPTED_ARCHIVE_NAME = 'crm-production-accepted.tar.gz';
const RELEASE_MANIFEST_PATH = '.release/crm-release-manifest.json';
const ACCEPTANCE_RECEIPT_PATH = '.release/crm-production-acceptance.json';
const LIVE_FETCH_TIMEOUT_MS = 20_000;

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertSha256(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  assert(SHA256.test(normalized), `${label} must be a SHA-256 digest.`);
  return normalized;
}

function assertCommit(value, label) {
  const normalized = String(value || '').trim().toLowerCase();
  assert(COMMIT_SHA.test(normalized), `${label} must be a full commit SHA.`);
  return normalized;
}

function assertSafeId(value, label) {
  const normalized = String(value || '').trim();
  assert(SAFE_ID.test(normalized), `${label} must be a safe opaque identifier.`);
  return normalized;
}

function assertHttpsOrigin(value, label) {
  const url = new URL(value);
  assert(
    url.protocol === 'https:'
      && url.origin === value
      && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname),
    `${label} must be a non-loopback HTTPS origin without a path.`,
  );
  return url.origin;
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'pipe',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    fail(
      `${commandName} ${args.join(' ')} failed:\n${
        (result.stderr || result.stdout || '').trim()
      }`,
    );
  }
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertRegularFile(path, label) {
  const metadata = await lstat(path).catch((error) => {
    if (error?.code === 'ENOENT') fail(`${label} is missing: ${path}`);
    throw error;
  });
  assert(metadata.isFile(), `${label} must be a regular file.`);
  assert(!metadata.isSymbolicLink(), `${label} cannot be a symbolic link.`);
}

async function readJson(path, label) {
  await assertRegularFile(path, label);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

async function walkRegularFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (current === root && entry.name === '.git') continue;
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`Symbolic links are forbidden in static release trees: ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...await walkRegularFiles(root, path));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      fail(`Only regular files and directories are allowed: ${path}`);
    }
  }
  return files;
}

function artifactDigest(files) {
  return sha256(
    files
      .map(({ path, sha256: digest, size }) => `${digest} ${size} ${path}\n`)
      .join(''),
  );
}

async function inventoryDirectory(root) {
  const resolvedRoot = resolve(root);
  const metadata = await lstat(resolvedRoot).catch((error) => {
    if (error?.code === 'ENOENT') fail(`Inventory root is missing: ${resolvedRoot}`);
    throw error;
  });
  assert(metadata.isDirectory(), `Inventory root must be a directory: ${resolvedRoot}`);
  assert(!metadata.isSymbolicLink(), 'Inventory root cannot be a symbolic link.');
  const paths = await walkRegularFiles(resolvedRoot);
  const files = await Promise.all(
    paths
      .map((path) => ({
        absolutePath: path,
        path: normalizePath(relative(resolvedRoot, path)),
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(async ({ absolutePath, path }) => {
        const contents = await readFile(absolutePath);
        return {
          path,
          sha256: sha256(contents),
          size: contents.byteLength,
        };
      }),
  );
  return {
    files,
    sha256: artifactDigest(files),
  };
}

function assertSafeArchiveEntry(entry) {
  assert(typeof entry === 'string' && entry.length > 0, 'Archive entry is empty.');
  assert(!entry.includes('\0'), 'Archive entry contains a null byte.');
  assert(!entry.includes('\\'), `Archive entry uses an unsafe separator: ${entry}`);
  assert(!entry.startsWith('/'), `Archive entry is absolute: ${entry}`);
  const normalized = entry.replace(/\/+$/, '');
  const parts = normalized.split('/');
  assert(
    parts.every((part) => part && part !== '.' && part !== '..'),
    `Archive entry escapes its root: ${entry}`,
  );
  const allowed = normalized === 'dist'
    || normalized.startsWith('dist/')
    || normalized === RELEASE_MANIFEST_PATH
    || normalized === ACCEPTANCE_RECEIPT_PATH
    || normalized === '.release';
  assert(allowed, `Archive contains an unexpected entry: ${entry}`);
  return normalized;
}

function inspectAcceptedArchive(archivePath) {
  const names = command('tar', ['-tzf', archivePath]).stdout
    .split('\n')
    .filter(Boolean);
  assert(names.length > 0, 'Accepted archive is empty.');
  const normalizedNames = names.map(assertSafeArchiveEntry);
  assert(
    new Set(normalizedNames).size === normalizedNames.length,
    'Accepted archive contains duplicate entries.',
  );
  for (const required of [
    'dist',
    RELEASE_MANIFEST_PATH,
    ACCEPTANCE_RECEIPT_PATH,
  ]) {
    assert(
      normalizedNames.includes(required),
      `Accepted archive is missing ${required}.`,
    );
  }

  const verbose = command('tar', ['-tvzf', archivePath]).stdout
    .split('\n')
    .filter(Boolean);
  assert(verbose.length === names.length, 'Archive listing is inconsistent.');
  for (const line of verbose) {
    assert(
      line.startsWith('-') || line.startsWith('d'),
      'Accepted archive may contain only regular files and directories.',
    );
  }
}

function assertManifestFiles(manifest, inventory) {
  assert(manifest?.schemaVersion === 1, 'Unsupported release manifest schema.');
  assert(manifest?.artifact?.root === 'dist', 'Release artifact root must be dist.');
  assert(
    manifest?.artifact?.format === 'astro-static-directory',
    'Release artifact format is not the static Astro directory contract.',
  );
  assert(
    manifest?.source?.clean === true && manifest?.backendContract?.clean === true,
    'Release manifest must attest clean source and backend revisions.',
  );
  assertSha256(manifest?.artifact?.sha256, 'Manifest artifact digest');
  assert(Array.isArray(manifest?.artifact?.files), 'Manifest file inventory is missing.');
  let previousPath = '';
  const seen = new Set();
  for (const [index, entry] of manifest.artifact.files.entries()) {
    const label = `manifest.artifact.files[${index}]`;
    assert(
      entry && Object.keys(entry).sort().join(',')
        === ['path', 'sha256', 'size'].sort().join(','),
      `${label} must contain exactly path, sha256, and size.`,
    );
    assertSafeArchiveEntry(`dist/${entry.path}`);
    assert(!seen.has(entry.path), `${label}.path is duplicated.`);
    assert(
      index === 0 || previousPath.localeCompare(entry.path) < 0,
      'Manifest file inventory must be sorted.',
    );
    assertSha256(entry.sha256, `${label}.sha256`);
    assert(
      Number.isSafeInteger(entry.size) && entry.size >= 0,
      `${label}.size is invalid.`,
    );
    seen.add(entry.path);
    previousPath = entry.path;
  }
  assert(
    JSON.stringify(inventory.files) === JSON.stringify(manifest.artifact.files),
    'Extracted artifact file inventory or checksum does not match its manifest.',
  );
  assert(
    inventory.sha256 === manifest.artifact.sha256,
    'Extracted artifact aggregate checksum does not match its manifest.',
  );
}

function assertCurrentApproval(receipt, expectedRollbackRef, now = Date.now()) {
  const approval = receipt?.gates?.deploymentApproval;
  assert(approval?.target === ACCEPTED_TARGET, 'Acceptance target is not production.');
  const startsAt = Date.parse(approval?.windowStartsAt);
  const endsAt = Date.parse(approval?.windowEndsAt);
  assert(Number.isFinite(startsAt) && Number.isFinite(endsAt), 'Approval window is invalid.');
  assert(startsAt <= now, 'Deployment approval window has not started.');
  assert(endsAt > now, 'Deployment approval window has expired.');
  assert(
    approval.rollbackReleaseId === expectedRollbackRef,
    'Current production commit is not the accepted rollback release.',
  );
  return approval;
}

function assertSafeTargetCheckout(targetDirectory, expectedRollbackRef) {
  const resolvedTarget = resolve(targetDirectory);
  assert(
    resolvedTarget !== resolve('/')
      && resolvedTarget !== resolve(homedir())
      && resolvedTarget !== repositoryRoot
      && dirname(resolvedTarget) !== resolvedTarget,
    `Refusing unsafe deployment target: ${resolvedTarget}`,
  );
  const topLevel = command(
    'git',
    ['rev-parse', '--show-toplevel'],
    { cwd: resolvedTarget },
  ).stdout;
  assert(
    realpathSync(topLevel) === realpathSync(resolvedTarget),
    'Deployment target must be a Git root.',
  );
  const head = command('git', ['rev-parse', 'HEAD'], { cwd: resolvedTarget }).stdout;
  assert(head === expectedRollbackRef, 'Deployment target HEAD changed after approval.');
  const status = command(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: resolvedTarget },
  ).stdout;
  assert(status === '', 'Deployment target checkout must be clean.');
  return resolvedTarget;
}

async function replaceStaticTree(targetDirectory, distDirectory) {
  const entries = await readdir(targetDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    await rm(join(targetDirectory, entry.name), { recursive: true, force: true });
  }
  const sourceEntries = await readdir(distDirectory, { withFileTypes: true });
  for (const entry of sourceEntries) {
    await cp(
      join(distDirectory, entry.name),
      join(targetDirectory, entry.name),
      {
        recursive: true,
        force: false,
        errorOnExist: true,
        preserveTimestamps: true,
      },
    );
  }
}

async function writeReceipt(path, value) {
  const outputPath = resolve(path);
  assert(
    outputPath !== resolve('/')
      && outputPath !== repositoryRoot
      && dirname(outputPath) !== outputPath,
    `Refusing unsafe receipt path: ${outputPath}`,
  );
  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
}

async function stageDeployment({
  archivePath,
  acceptedArchiveSha256,
  externalEvidenceSha256,
  websiteCommit,
  backendCommit,
  targetDirectory,
  expectedRollbackRef,
  deploymentId,
  outputPath,
  now = Date.now(),
}) {
  const archive = resolve(archivePath);
  await assertRegularFile(archive, 'Accepted archive');
  assert(
    basename(archive) === ACCEPTED_ARCHIVE_NAME,
    `Accepted archive must be named ${ACCEPTED_ARCHIVE_NAME}.`,
  );
  const expectedArchiveDigest = assertSha256(
    acceptedArchiveSha256,
    'Accepted archive digest',
  );
  const actualArchiveDigest = sha256(await readFile(archive));
  assert(
    actualArchiveDigest === expectedArchiveDigest,
    'Accepted archive does not match its approved SHA-256.',
  );
  const evidenceDigest = assertSha256(
    externalEvidenceSha256,
    'External evidence digest',
  );
  const sourceCommit = assertCommit(websiteCommit, 'Website commit');
  const contractCommit = assertCommit(backendCommit, 'Backend contract commit');
  const rollbackRef = assertCommit(expectedRollbackRef, 'Rollback commit');
  const releaseId = assertSafeId(deploymentId, 'Deployment ID');
  inspectAcceptedArchive(archive);

  const extractionRoot = await mkdtemp(
    join(tmpdir(), 'huddleway-crm-production-deploy-'),
  );
  try {
    command(
      'tar',
      [
        '-xzf',
        archive,
        '--directory',
        extractionRoot,
        '--no-same-owner',
        '--no-same-permissions',
      ],
    );
    await walkRegularFiles(extractionRoot);
    const distDirectory = join(extractionRoot, 'dist');
    const manifest = await readJson(
      join(extractionRoot, RELEASE_MANIFEST_PATH),
      'Embedded release manifest',
    );
    const receipt = await readJson(
      join(extractionRoot, ACCEPTANCE_RECEIPT_PATH),
      'Embedded acceptance receipt',
    );
    verifyAcceptanceReceipt(receipt, manifest, evidenceDigest);
    assert(
      manifest.source.commit === sourceCommit
        && receipt.release.websiteCommit === sourceCommit,
      'Accepted archive does not match the reviewed website commit.',
    );
    assert(
      manifest.backendContract.commit === contractCommit
        && receipt.release.backendCommit === contractCommit,
      'Accepted archive does not match the reviewed backend commit.',
    );
    const artifactInventory = await inventoryDirectory(distDirectory);
    assertManifestFiles(manifest, artifactInventory);
    const approval = assertCurrentApproval(receipt, rollbackRef, now);
    const staticTarget = assertSafeTargetCheckout(targetDirectory, rollbackRef);
    const rollbackInventory = await inventoryDirectory(staticTarget);
    assert(
      rollbackInventory.sha256 === approval.rollbackArtifactSha256,
      'Current production tree does not match the accepted rollback artifact.',
    );

    await replaceStaticTree(staticTarget, distDirectory);
    const stagedInventory = await inventoryDirectory(staticTarget);
    assertManifestFiles(manifest, stagedInventory);
    const body = {
      schemaVersion: 1,
      status: 'staged',
      deploymentId: releaseId,
      stagedAt: new Date(now).toISOString(),
      target: ACCEPTED_TARGET,
      acceptedArchiveSha256: expectedArchiveDigest,
      externalEvidenceSha256: evidenceDigest,
      acceptanceSha256: receipt.acceptanceSha256,
      release: {
        websiteCommit: sourceCommit,
        backendCommit: contractCommit,
        artifactSha256: manifest.artifact.sha256,
        fileCount: manifest.artifact.files.length,
      },
      rollback: {
        gitRef: rollbackRef,
        artifactSha256: rollbackInventory.sha256,
        fileCount: rollbackInventory.files.length,
      },
    };
    const plan = {
      ...body,
      planSha256: sha256(canonicalJson(body)),
    };
    await writeReceipt(outputPath, plan);
    return plan;
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

function verifyDeploymentPlan(plan) {
  assert(plan?.schemaVersion === 1, 'Unsupported deployment plan schema.');
  assert(plan?.status === 'staged', 'Deployment plan is not staged.');
  assert(plan?.target === ACCEPTED_TARGET, 'Deployment plan target is invalid.');
  const { planSha256, ...body } = plan;
  assert(
    assertSha256(planSha256, 'Deployment plan digest')
      === sha256(canonicalJson(body)),
    'Deployment plan checksum is invalid.',
  );
  return plan;
}

function publicPathForArtifact(path) {
  assertSafeArchiveEntry(`dist/${path}`);
  if (path === 'index.html') return '/';
  if (path.endsWith('/index.html')) {
    return `/${path.slice(0, -'index.html'.length)}`;
  }
  return `/${path}`;
}

function isPublicArtifact(path) {
  const segments = path.split('/');
  return segments.every(
    (segment, index) =>
      !segment.startsWith('.') || index === 0 && segment === '.well-known',
  );
}

async function fetchResponse(url, options = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(LIVE_FETCH_TIMEOUT_MS),
    ...options,
  });
  const expectedOrigin = new URL(url).origin;
  assert(
    new URL(response.url).origin === expectedOrigin,
    `Live verification redirected outside ${expectedOrigin}.`,
  );
  return response;
}

async function fetchExactFile(origin, entry) {
  const path = publicPathForArtifact(entry.path);
  const response = await fetchResponse(`${origin}${path}`, {
    headers: { 'Accept-Encoding': 'identity' },
  });
  assert(response.status === 200, `${path} returned HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.byteLength === entry.size, `${path} has the wrong byte length.`);
  assert(sha256(bytes) === entry.sha256, `${path} does not match the accepted artifact.`);
  return path;
}

function parseMaxAge(cacheControl) {
  const match = String(cacheControl || '').match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) : -1;
}

function isWarmCacheHit(headers) {
  const values = [
    headers.get('x-cache'),
    headers.get('cf-cache-status'),
    headers.get('x-proxy-cache'),
  ].filter(Boolean).join(' ');
  const age = Number(headers.get('age') || 0);
  return /\bhit\b/i.test(values) || Number.isFinite(age) && age > 0;
}

function cacheStatus(headers) {
  return [
    headers.get('x-cache'),
    headers.get('cf-cache-status'),
    headers.get('x-proxy-cache'),
  ].filter(Boolean).join(' ') || (
    Number(headers.get('age') || 0) > 0 ? 'age-positive' : 'unknown'
  );
}

async function verifyCdnAsset(origin, entry) {
  const path = publicPathForArtifact(entry.path);
  const url = `${origin}${path}`;
  const brotli = await fetchResponse(url, {
    headers: { 'Accept-Encoding': 'br' },
  });
  assert(brotli.status === 200, `${path} Brotli probe failed.`);
  assert(
    brotli.headers.get('content-encoding') === 'br',
    `${path} is not served with Brotli compression.`,
  );
  assert(
    /\baccept-encoding\b/i.test(brotli.headers.get('vary') || ''),
    `${path} Brotli response does not vary on Accept-Encoding.`,
  );
  assert(!brotli.headers.has('set-cookie'), `${path} Brotli response set a cookie.`);
  const gzip = await fetchResponse(url, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert(gzip.status === 200, `${path} gzip probe failed.`);
  assert(
    gzip.headers.get('content-encoding') === 'gzip',
    `${path} is not served with gzip compression.`,
  );
  assert(
    /\baccept-encoding\b/i.test(gzip.headers.get('vary') || ''),
    `${path} gzip response does not vary on Accept-Encoding.`,
  );
  assert(!gzip.headers.has('set-cookie'), `${path} gzip response set a cookie.`);
  const cacheControl = gzip.headers.get('cache-control') || '';
  assert(/\bpublic\b/i.test(cacheControl), `${path} cache policy is not public.`);
  assert(/\bimmutable\b/i.test(cacheControl), `${path} cache policy is not immutable.`);
  assert(
    parseMaxAge(cacheControl) >= 31_536_000,
    `${path} immutable cache lifetime is shorter than one year.`,
  );
  const warm = await fetchResponse(url, {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  assert(warm.status === 200, `${path} warm-cache probe failed.`);
  assert(isWarmCacheHit(warm.headers), `${path} did not produce a warm cache hit.`);
  assert(!warm.headers.has('set-cookie'), `${path} warm response set a cookie.`);
  return {
    path,
    sha256: entry.sha256,
    size: entry.size,
    brotliEncoding: brotli.headers.get('content-encoding'),
    gzipEncoding: gzip.headers.get('content-encoding'),
    vary: gzip.headers.get('vary'),
    cacheControl,
    warmCacheStatus: cacheStatus(warm.headers),
  };
}

function cdnCandidateEntries(manifest) {
  const candidates = manifest?.artifact?.files
    ?.filter(
      (entry) =>
        /^_astro\/.+\.[A-Za-z0-9_-]{6,}\.(?:js|css)$/i.test(entry.path)
        && entry.size >= 4_096,
    )
    .sort((a, b) => b.size - a.size) || [];
  assert(candidates.length >= 3, 'Release needs three fingerprinted CDN assets.');
  return candidates.slice(0, 3);
}

async function probeCdnCandidate({
  manifestPath,
  origin,
  outputPath,
  now = Date.now(),
}) {
  const manifest = await readJson(resolve(manifestPath), 'Release manifest');
  assert(manifest?.schemaVersion === 1, 'Release manifest schema must be 1.');
  const liveOrigin = assertHttpsOrigin(origin, 'Canary origin');
  const websiteCommit = assertCommit(
    manifest?.source?.commit,
    'Manifest website commit',
  );
  const artifactSha256 = assertSha256(
    manifest?.artifact?.sha256,
    'Manifest artifact digest',
  );
  const assets = [];
  for (const entry of cdnCandidateEntries(manifest)) {
    assertSha256(entry.sha256, `Artifact digest for ${entry.path}`);
    assert(
      Number.isSafeInteger(entry.size) && entry.size >= 4_096,
      `Artifact size for ${entry.path} is invalid.`,
    );
    await fetchExactFile(liveOrigin, entry);
    assets.push(await verifyCdnAsset(liveOrigin, entry));
  }
  const body = {
    schemaVersion: 1,
    status: 'verified',
    probeOnly: true,
    checkedAt: new Date(now).toISOString(),
    origin: liveOrigin,
    websiteCommit,
    artifactSha256,
    assets,
  };
  const receipt = {
    ...body,
    cdnProbeSha256: sha256(canonicalJson(body)),
  };
  await writeReceipt(outputPath, receipt);
  return receipt;
}

async function waitForSentinel(origin, entry, attempts, intervalMs) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fetchExactFile(origin, entry);
      return attempt;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
      }
    }
  }
  fail(`Production did not converge to the accepted artifact: ${lastError.message}`);
}

async function verifyBackendHealth(backendHealthUrl) {
  const url = new URL(backendHealthUrl);
  assert(
    url.protocol === 'https:'
      && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname),
    'Backend health URL must use non-loopback HTTPS.',
  );
  const response = await fetchResponse(url.href);
  assert(response.status === 200, `Backend health returned HTTP ${response.status}.`);
  const requestId = response.headers.get('x-request-id');
  assert(requestId && requestId.length >= 8, 'Backend health omitted its request ID.');
  const payload = await response.json();
  assert(payload?.ok === true, 'Backend health payload is not healthy.');
  return {
    origin: url.origin,
    requestIdSha256: sha256(requestId),
  };
}

async function verifyLiveDeployment({
  manifestPath,
  acceptancePath,
  planPath,
  externalEvidenceSha256,
  acceptedArchiveSha256,
  deployedCommit,
  origin,
  backendHealthUrl,
  outputPath,
  attempts = 12,
  intervalMs = 15_000,
  now = Date.now(),
}) {
  const manifest = await readJson(resolve(manifestPath), 'Release manifest');
  const acceptance = await readJson(resolve(acceptancePath), 'Acceptance receipt');
  const plan = verifyDeploymentPlan(
    await readJson(resolve(planPath), 'Deployment plan'),
  );
  const evidenceDigest = assertSha256(
    externalEvidenceSha256,
    'External evidence digest',
  );
  verifyAcceptanceReceipt(acceptance, manifest, evidenceDigest);
  assert(
    plan.externalEvidenceSha256 === evidenceDigest,
    'Deployment plan evidence binding changed.',
  );
  assert(
    plan.acceptedArchiveSha256
      === assertSha256(acceptedArchiveSha256, 'Accepted archive digest'),
    'Deployment plan archive binding changed.',
  );
  assert(
    plan.acceptanceSha256 === acceptance.acceptanceSha256,
    'Deployment plan acceptance binding changed.',
  );
  assert(
    plan.release.websiteCommit === manifest.source.commit
      && plan.release.backendCommit === manifest.backendContract.commit
      && plan.release.artifactSha256 === manifest.artifact.sha256
      && plan.release.fileCount === manifest.artifact.files.length,
    'Deployment plan release binding changed.',
  );
  const commit = assertCommit(deployedCommit, 'Deployed commit');
  const liveOrigin = assertHttpsOrigin(origin, 'Production origin');
  const safeAttempts = Number(attempts);
  const safeInterval = Number(intervalMs);
  assert(
    Number.isSafeInteger(safeAttempts) && safeAttempts >= 1 && safeAttempts <= 30,
    'Live verification attempts must be between 1 and 30.',
  );
  assert(
    Number.isSafeInteger(safeInterval) && safeInterval >= 0 && safeInterval <= 60_000,
    'Live verification interval must be between 0 and 60000 ms.',
  );

  const publicFiles = manifest.artifact.files.filter(
    (entry) => isPublicArtifact(entry.path),
  );
  const sentinel = publicFiles.find((entry) => entry.path === 'admin/index.html')
    || publicFiles.find((entry) => entry.path === 'index.html');
  assert(sentinel, 'Release manifest has no public HTML sentinel.');
  const convergenceAttempt = await waitForSentinel(
    liveOrigin,
    sentinel,
    safeAttempts,
    safeInterval,
  );
  const verifiedPaths = [];
  for (const entry of publicFiles) {
    verifiedPaths.push(await fetchExactFile(liveOrigin, entry));
  }
  for (const route of manifest.artifact.routes || []) {
    const response = await fetchResponse(`${liveOrigin}${route}`, {
      headers: { 'Accept-Encoding': 'identity' },
    });
    assert(response.status === 200, `${route} returned HTTP ${response.status}.`);
  }

  const cdnCandidates = cdnCandidateEntries(manifest);
  const cdnPaths = [];
  for (const entry of cdnCandidates) {
    cdnPaths.push(await verifyCdnAsset(liveOrigin, entry));
  }
  const backend = await verifyBackendHealth(backendHealthUrl);
  const body = {
    schemaVersion: 1,
    status: 'verified',
    deploymentId: plan.deploymentId,
    verifiedAt: new Date(now).toISOString(),
    target: ACCEPTED_TARGET,
    origin: liveOrigin,
    deployedCommit: commit,
    acceptedArchiveSha256: plan.acceptedArchiveSha256,
    acceptanceSha256: acceptance.acceptanceSha256,
    externalEvidenceSha256: evidenceDigest,
    release: plan.release,
    rollback: plan.rollback,
    checks: {
      convergenceAttempt,
      verifiedFileCount: verifiedPaths.length,
      routeCount: (manifest.artifact.routes || []).length,
      cdnAssetCount: cdnPaths.length,
      backendOrigin: backend.origin,
      backendRequestIdSha256: backend.requestIdSha256,
    },
  };
  const receipt = {
    ...body,
    deploymentSha256: sha256(canonicalJson(body)),
  };
  await writeReceipt(outputPath, receipt);
  return receipt;
}

function rollbackReceiptBody(
  plan,
  failedDeployedCommit,
  rollbackCommit,
  now,
) {
  const failedCommit = assertCommit(
    failedDeployedCommit,
    'Failed deployed commit',
  );
  const restoredCommit = assertCommit(rollbackCommit, 'Rollback commit');
  assert(
    failedCommit !== restoredCommit,
    'Rollback commit must differ from the failed deployment commit.',
  );
  return {
    schemaVersion: 1,
    status: 'rolled-back',
    deploymentId: plan.deploymentId,
    rolledBackAt: new Date(now).toISOString(),
    target: ACCEPTED_TARGET,
    failedDeployedCommit: failedCommit,
    rollbackCommit: restoredCommit,
    restoredSourceCommit: plan.rollback.gitRef,
    restoredArtifactSha256: plan.rollback.artifactSha256,
    failedArtifactSha256: plan.release.artifactSha256,
    reason: 'postdeploy-verification-failed',
  };
}

async function recordRollback({
  planPath,
  failedDeployedCommit,
  rollbackCommit,
  outputPath,
  now = Date.now(),
}) {
  const plan = verifyDeploymentPlan(
    await readJson(resolve(planPath), 'Deployment plan'),
  );
  const body = rollbackReceiptBody(
    plan,
    failedDeployedCommit,
    rollbackCommit,
    now,
  );
  const receipt = {
    ...body,
    rollbackSha256: sha256(canonicalJson(body)),
  };
  await writeReceipt(outputPath, receipt);
  return receipt;
}

async function verifyLiveRollback({
  directory,
  planPath,
  failedDeployedCommit,
  rollbackCommit,
  origin,
  backendHealthUrl,
  outputPath,
  attempts = 12,
  intervalMs = 15_000,
  now = Date.now(),
}) {
  const plan = verifyDeploymentPlan(
    await readJson(resolve(planPath), 'Deployment plan'),
  );
  const restoredInventory = await inventoryDirectory(resolve(directory));
  assert(
    restoredInventory.sha256 === plan.rollback.artifactSha256
      && restoredInventory.files.length === plan.rollback.fileCount,
    'Rollback checkout does not match the accepted rollback tree.',
  );
  const liveOrigin = assertHttpsOrigin(origin, 'Production origin');
  const safeAttempts = Number(attempts);
  const safeInterval = Number(intervalMs);
  assert(
    Number.isSafeInteger(safeAttempts) && safeAttempts >= 1 && safeAttempts <= 30,
    'Live verification attempts must be between 1 and 30.',
  );
  assert(
    Number.isSafeInteger(safeInterval) && safeInterval >= 0 && safeInterval <= 60_000,
    'Live verification interval must be between 0 and 60000 ms.',
  );
  const publicFiles = restoredInventory.files.filter(
    (entry) => isPublicArtifact(entry.path),
  );
  const sentinel = publicFiles.find((entry) => entry.path === 'index.html');
  assert(sentinel, 'Rollback tree has no public index.html sentinel.');
  const convergenceAttempt = await waitForSentinel(
    liveOrigin,
    sentinel,
    safeAttempts,
    safeInterval,
  );
  for (const entry of publicFiles) {
    await fetchExactFile(liveOrigin, entry);
  }
  const backend = await verifyBackendHealth(backendHealthUrl);
  const recordBody = rollbackReceiptBody(
    plan,
    failedDeployedCommit,
    rollbackCommit,
    now,
  );
  const body = {
    ...recordBody,
    live: {
      origin: liveOrigin,
      convergenceAttempt,
      verifiedFileCount: publicFiles.length,
      backendOrigin: backend.origin,
      backendRequestIdSha256: backend.requestIdSha256,
    },
  };
  const verifiedReceipt = {
    ...body,
    rollbackSha256: sha256(canonicalJson(body)),
  };
  await writeReceipt(outputPath, verifiedReceipt);
  return verifiedReceipt;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    assert(argument.startsWith('--'), `Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = args[index + 1];
    assert(value && !value.startsWith('--'), `Missing value for --${key}`);
    assert(!(key in options), `Duplicate option: --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function requiredOption(options, key) {
  const value = String(options[key] || '').trim();
  assert(value, `--${key} is required.`);
  return value;
}

async function inventoryCommand(options) {
  const directory = resolve(requiredOption(options, 'directory'));
  const inventory = await inventoryDirectory(directory);
  if (options['expected-sha256']) {
    assert(
      inventory.sha256
        === assertSha256(options['expected-sha256'], 'Expected inventory digest'),
      'Directory does not match its expected artifact digest.',
    );
  }
  console.log(JSON.stringify({
    directory,
    fileCount: inventory.files.length,
    artifactSha256: inventory.sha256,
  }));
}

async function stageCommand(options) {
  const plan = await stageDeployment({
    archivePath: requiredOption(options, 'archive'),
    acceptedArchiveSha256: requiredOption(options, 'archive-sha256'),
    externalEvidenceSha256: requiredOption(options, 'external-evidence-sha256'),
    websiteCommit: requiredOption(options, 'website-commit'),
    backendCommit: requiredOption(options, 'backend-commit'),
    targetDirectory: requiredOption(options, 'target-directory'),
    expectedRollbackRef: requiredOption(options, 'expected-rollback-ref'),
    deploymentId: requiredOption(options, 'deployment-id'),
    outputPath: requiredOption(options, 'out'),
  });
  console.log(`Production artifact staged: ${plan.planSha256}`);
}

async function verifyLiveCommand(options) {
  const receipt = await verifyLiveDeployment({
    manifestPath: requiredOption(options, 'manifest'),
    acceptancePath: requiredOption(options, 'acceptance'),
    planPath: requiredOption(options, 'plan'),
    externalEvidenceSha256: requiredOption(
      options,
      'external-evidence-sha256',
    ),
    acceptedArchiveSha256: requiredOption(options, 'archive-sha256'),
    deployedCommit: requiredOption(options, 'deployed-commit'),
    origin: requiredOption(options, 'origin'),
    backendHealthUrl: requiredOption(options, 'backend-health-url'),
    outputPath: requiredOption(options, 'out'),
    attempts: options.attempts ?? 12,
    intervalMs: options['interval-ms'] ?? 15_000,
  });
  console.log(`Production deployment verified: ${receipt.deploymentSha256}`);
}

async function probeCdnCommand(options) {
  const receipt = await probeCdnCandidate({
    manifestPath: requiredOption(options, 'manifest'),
    origin: requiredOption(options, 'origin'),
    outputPath: requiredOption(options, 'out'),
  });
  console.log(`Candidate CDN verified: ${receipt.cdnProbeSha256}`);
}

async function recordRollbackCommand(options) {
  const receipt = await recordRollback({
    planPath: requiredOption(options, 'plan'),
    failedDeployedCommit: requiredOption(options, 'failed-deployed-commit'),
    rollbackCommit: requiredOption(options, 'rollback-commit'),
    outputPath: requiredOption(options, 'out'),
  });
  console.log(`Production rollback recorded: ${receipt.rollbackSha256}`);
}

async function verifyRollbackLiveCommand(options) {
  const receipt = await verifyLiveRollback({
    directory: requiredOption(options, 'directory'),
    planPath: requiredOption(options, 'plan'),
    failedDeployedCommit: requiredOption(options, 'failed-deployed-commit'),
    rollbackCommit: requiredOption(options, 'rollback-commit'),
    origin: requiredOption(options, 'origin'),
    backendHealthUrl: requiredOption(options, 'backend-health-url'),
    outputPath: requiredOption(options, 'out'),
    attempts: options.attempts ?? 12,
    intervalMs: options['interval-ms'] ?? 15_000,
  });
  console.log(`Production rollback verified: ${receipt.rollbackSha256}`);
}

async function main() {
  const [subcommand, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (subcommand === 'inventory') return inventoryCommand(options);
  if (subcommand === 'stage') return stageCommand(options);
  if (subcommand === 'probe-cdn') return probeCdnCommand(options);
  if (subcommand === 'verify-live') return verifyLiveCommand(options);
  if (subcommand === 'record-rollback') return recordRollbackCommand(options);
  if (subcommand === 'verify-rollback-live') {
    return verifyRollbackLiveCommand(options);
  }
  fail(
    'Usage: crm-production-deploy.mjs '
      + '<inventory|stage|probe-cdn|verify-live|record-rollback|verify-rollback-live> '
      + '[options]',
  );
}

export {
  artifactDigest,
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
  verifyLiveDeployment,
  verifyLiveRollback,
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`CRM production deployment gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
