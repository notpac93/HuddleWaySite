#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;

function fail(message) {
  throw new Error(message);
}

function required(options, name) {
  const value = String(options[name] ?? '').trim();
  if (!value) fail(`Missing required option: --${name}`);
  return value;
}

function commit(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!COMMIT_SHA.test(normalized)) fail(`${label} must be a full commit SHA.`);
  return normalized;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function inventoryDirectory(directory) {
  const root = resolve(directory);
  const files = [];

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        const bytes = await readFile(path);
        files.push({
          path: relative(root, path).split('/').join('/'),
          sha256: sha256(bytes),
          bytes: bytes.length,
        });
      } else {
        fail(`Unsupported static target entry: ${path}`);
      }
    }
  }

  await visit(root);
  const canonical = JSON.stringify(files);
  return { sha256: sha256(canonical), files };
}

async function clearTarget(target) {
  const entries = await readdir(target, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.name !== '.git')
    .map((entry) => rm(join(target, entry.name), { recursive: true, force: true })));
}

async function stage(options) {
  const source = resolve(required(options, 'source'));
  const target = resolve(required(options, 'target'));
  const websiteCommit = commit(required(options, 'website-commit'), 'website-commit');
  const backendCommit = commit(required(options, 'backend-commit'), 'backend-commit');
  const releaseId = required(options, 'release-id');
  const output = resolve(required(options, 'out'));

  const [sourceStats, targetStats] = await Promise.all([stat(source), stat(target)]);
  if (!sourceStats.isDirectory() || !targetStats.isDirectory()) {
    fail('Source and target must both be directories.');
  }

  const rollback = await inventoryDirectory(target);
  await clearTarget(target);
  await cp(source, target, { recursive: true, force: true });

  const releaseMarker = {
    schemaVersion: 1,
    releaseId,
    mode: 'single-developer',
    websiteCommit,
    backendCommit,
    rollbackArtifactSha256: rollback.sha256,
  };
  const markerPath = join(target, '.well-known', 'huddleway-crm-release.json');
  await mkdir(join(target, '.well-known'), { recursive: true });
  await writeFile(markerPath, `${JSON.stringify(releaseMarker, null, 2)}\n`);

  const deployed = await inventoryDirectory(target);
  const plan = {
    schemaVersion: 1,
    mode: 'single-developer',
    releaseId,
    websiteCommit,
    backendCommit,
    deployedArtifactSha256: deployed.sha256,
    rollback: {
      artifactSha256: rollback.sha256,
      sourceCommit: 'recorded-by-git-before-publish',
    },
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

async function verifyLive(options) {
  const origin = required(options, 'origin').replace(/\/$/, '');
  const backendHealthUrl = required(options, 'backend-health-url');
  const websiteCommit = commit(required(options, 'website-commit'), 'website-commit');
  const backendCommit = commit(required(options, 'backend-commit'), 'backend-commit');
  const output = resolve(required(options, 'out'));
  const attempts = Math.max(1, Number(options.attempts ?? 12));
  const intervalMs = Math.max(0, Number(options['interval-ms'] ?? 5_000));

  let release;
  let adminResponse;
  let healthResponse;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const releaseResponse = await fetch(
        `${origin}/.well-known/huddleway-crm-release.json`,
        { redirect: 'error' },
      );
      if (!releaseResponse.ok) {
        throw new Error(`Live release marker returned HTTP ${releaseResponse.status}.`);
      }
      const candidateRelease = await releaseResponse.json();
      if (
        candidateRelease.websiteCommit !== websiteCommit
        || candidateRelease.backendCommit !== backendCommit
      ) {
        throw new Error('Live release marker does not match the requested commits.');
      }
      const candidateAdminResponse = await fetch(`${origin}/admin/`, {
        redirect: 'error',
      });
      if (!candidateAdminResponse.ok) {
        throw new Error(`Live CRM route returned HTTP ${candidateAdminResponse.status}.`);
      }
      const adminHtml = await candidateAdminResponse.text();
      if (!/<html[\s>]/i.test(adminHtml)) {
        throw new Error('Live CRM route did not return an HTML document.');
      }
      const candidateHealthResponse = await fetch(backendHealthUrl, {
        redirect: 'error',
      });
      if (!candidateHealthResponse.ok) {
        throw new Error(`Backend health returned HTTP ${candidateHealthResponse.status}.`);
      }
      release = candidateRelease;
      adminResponse = candidateAdminResponse;
      healthResponse = candidateHealthResponse;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolvePromise) => {
        setTimeout(resolvePromise, intervalMs);
      });
    }
  }
  if (!release || !adminResponse || !healthResponse) {
    fail(lastError?.message ?? 'Live deployment verification failed.');
  }
  const receipt = {
    schemaVersion: 1,
    mode: 'single-developer',
    verifiedAt: new Date().toISOString(),
    origin,
    websiteCommit,
    backendCommit,
    adminStatus: adminResponse.status,
    backendHealthStatus: healthResponse.status,
  };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    options[name] = args[index + 1];
    index += 1;
  }
  return options;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === 'stage') {
    const plan = await stage(options);
    console.log(`Staged single-developer release ${plan.releaseId}.`);
    return;
  }
  if (command === 'verify-live') {
    const receipt = await verifyLive(options);
    console.log(`Verified live single-developer release for ${receipt.websiteCommit}.`);
    return;
  }
  fail('Usage: crm-single-developer-deploy.mjs <stage|verify-live> [options]');
}

export { inventoryDirectory, stage, verifyLive };

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(`Single-developer deployment failed: ${error.message}`);
    process.exitCode = 1;
  });
}
