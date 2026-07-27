#!/usr/bin/env node

import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const defaultDistDirectory = join(repositoryRoot, 'dist');
const defaultManifestPath = join(
  repositoryRoot,
  '.release',
  'crm-release-manifest.json',
);

const exactCanonicalInputs = [
  '.env.example',
  '.github/workflows/crm-media-evidence.yml',
  '.github/workflows/crm-production-acceptance.yml',
  '.github/workflows/crm-production-deploy.yml',
  '.github/workflows/crm-release-gate.yml',
  '.node-version',
  'astro.config.mjs',
  'config/crm-performance-budgets.json',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'scripts/check-crm-performance.mjs',
  'scripts/check-security-headers.mjs',
  'scripts/release/crm-external-evidence.mjs',
  'scripts/release/crm-media-evidence.mjs',
  'scripts/release/crm-production-deploy.mjs',
  'scripts/release/crm-release.mjs',
  'src/layouts/CrmLayout.astro',
  'src/lib/authStore.ts',
  'src/lib/firebase.ts',
  'src/lib/firebaseStorage.ts',
  'src/pages/admin/index.astro',
  'src/pages/admin/setup.astro',
  'src/styles/crm.css',
  'tailwind.config.mjs',
  'tsconfig.json',
  'vitest.component.config.ts',
  'vitest.config.ts',
  'vitest.integration.config.ts',
];

const canonicalInputDirectories = [
  ['src', ['.astro', '.css', '.svelte', '.ts']],
  ['tests', ['.ts', '.svelte', '.md']],
];

const exactBackendContractFiles = [
  '.github/workflows/app_check_monitor_evidence.yml',
  '.github/workflows/crm_rum_evidence.yml',
  'analysis_options.yaml',
  'android/app/build.gradle.kts',
  'android/app/proguard-rules.pro',
  'android/build.gradle.kts',
  'android/gradle.properties',
  'android/gradle/wrapper/gradle-wrapper.jar',
  'android/gradle/wrapper/gradle-wrapper.properties',
  'android/gradlew',
  'android/gradlew.bat',
  'android/key.properties.example',
  'android/settings.gradle.kts',
  'backend/package-lock.json',
  'backend/package.json',
  'backend/rate_limit.js',
  'backend/server.js',
  'backend/config/crm_release_operations.json',
  'backend/scripts/collect_app_check_monitor_evidence.js',
  'backend/scripts/collect_crm_rum_evidence.js',
  'backend/lib/crm_contracts.js',
  'backend/lib/crm_migration_contract.js',
  'backend/lib/direct_invoice_contract.js',
  'backend/lib/team_membership_contract.js',
  'docs/CRM_DATA_DICTIONARY.md',
  'docs/CRM_RELEASE_OPERATIONS_RUNBOOK.md',
  'docs/FINANCIALS_SCHEMA_SOURCE_OF_TRUTH.md',
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
  'functions/create_demo.js',
  'functions/crm_audit_triggers.js',
  'functions/cloud_run_metadata.js',
  'functions/index.js',
  'functions/media_optimization.js',
  'functions/native_icon_package.js',
  'functions/native_icon_release.js',
  'functions/package-lock.json',
  'functions/package.json',
  'ios/Flutter/AppFrameworkInfo.plist',
  'ios/Flutter/Debug-Admin.xcconfig',
  'ios/Flutter/Debug.xcconfig',
  'ios/Flutter/Release-Admin.xcconfig',
  'ios/Flutter/Release.xcconfig',
  'ios/Podfile',
  'ios/Podfile.lock',
  'ios/Runner.xcodeproj/project.pbxproj',
  'pubspec.lock',
  'pubspec.yaml',
  'storage.rules',
  'web/terms.html',
];

const backendContractDirectories = [
  ['assets', null],
  ['android/app/src', null],
  ['backend/lib', ['.js']],
  ['backend/scripts', ['.js']],
  ['backend/test', ['.js']],
  ['functions/scripts', ['.js']],
  ['functions/test', ['.js']],
  ['integration_test', ['.dart']],
  ['ios/Runner', null],
  ['ios/Runner.xcodeproj/xcshareddata', null],
  ['ios/Runner.xcworkspace/xcshareddata', null],
  ['lib', ['.dart']],
  ['test', ['.dart']],
  ['web', null],
];

const backendCanonicalDeletions = Object.freeze([
  'backend/lib/program_activation_access.js',
  'lib/src/core/services/program_activation_gate_service.dart',
  'lib/src/core/services/program_activation_service.dart',
  'lib/src/features/home/presentation/widgets/about_section.dart',
  'lib/src/features/home/presentation/widgets/news_section.dart',
  'lib/src/features/onboarding/presentation/program_activation_checkout_screen.dart',
  'lib/src/features/onboarding/presentation/program_activation_payment_screen.dart',
  'lib/src/features/onboarding/presentation/program_activation_screen.dart',
  'lib/src/features/teams/presentation/widgets/team_page_template.dart',
  'test/program_activation_checkout_screen_test.dart',
  'test/program_activation_screen_test.dart',
]);

const releaseCommands = [
  'npm ci',
  'npm run release:preflight',
  'npm run test:type',
  'npm run test:unit',
  'npm run test:component',
  'npm run test:integration',
  'npm run test:e2e',
  'npm run release:audit',
  'npm run release:clean',
  'npm run build',
  'npm run release:quarantine',
  'npm run check:security',
  'npm run release:manifest',
  'npm run release:verify',
];

function fail(message) {
  throw new Error(message);
}

function normalizePath(path) {
  return path.split(sep).join('/');
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

function git(args, cwd = repositoryRoot, options = {}) {
  return command('git', args, { cwd, ...options });
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

async function hashFile(path) {
  const contents = await readFile(path);
  return createHash('sha256').update(contents).digest('hex');
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function walkFiles(root, allowedExtensions) {
  if (!(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.DS_Store') continue;
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) {
      fail(`Symbolic links are not allowed in release inputs or artifacts: ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...await walkFiles(path, allowedExtensions));
    } else if (
      entry.isFile()
      && (
        !allowedExtensions
        || allowedExtensions.some((extension) => entry.name.endsWith(extension))
      )
    ) {
      files.push(path);
    }
  }
  return files;
}

async function canonicalInputs() {
  const paths = [...exactCanonicalInputs];
  for (const [directory, extensions] of canonicalInputDirectories) {
    const absoluteDirectory = join(repositoryRoot, directory);
    const files = await walkFiles(absoluteDirectory, extensions);
    const relativeFiles = files.map(
      (path) => normalizePath(relative(repositoryRoot, path)),
    );
    const visible = releaseVisibleFiles(repositoryRoot, relativeFiles);
    const visibleFiles = relativeFiles.filter((path) => visible.has(path));
    if (visibleFiles.length === 0) {
      fail(`Canonical source directory is empty or missing: ${directory}`);
    }
    paths.push(...visibleFiles);
  }
  const discoveredPublicFiles = (await walkFiles(join(repositoryRoot, 'public')))
    .map((path) => normalizePath(relative(repositoryRoot, path)));
  const visiblePublicFiles = releaseVisibleFiles(
    repositoryRoot,
    discoveredPublicFiles,
  );
  const publicFiles = discoveredPublicFiles
    .filter((path) => visiblePublicFiles.has(path))
    .filter((path) => !path.startsWith('public/app/'));
  paths.push(...publicFiles);
  const releaseDocs = (await walkFiles(join(repositoryRoot, 'docs'), ['.md']))
    .map((path) => normalizePath(relative(repositoryRoot, path)))
    .filter((path) => {
      const name = path.slice('docs/'.length);
      return name.startsWith('CRM_')
        || name === 'FEATURE_DEV_SCRIPT__CRM_PRODUCTION_RELEASE.md'
        || name === 'FINANCIALS_SCHEMA_SOURCE_OF_TRUTH.md'
        || name === 'YOUTH_SPORTS_CRM_PRODUCT_RESEARCH.md';
    });
  paths.push(...releaseDocs);
  return [...new Set(paths)].sort();
}

async function backendContractInputs(root) {
  const paths = [...exactBackendContractFiles];
  for (const [directory, extensions] of backendContractDirectories) {
    const absoluteDirectory = join(root, directory);
    const files = await walkFiles(absoluteDirectory, extensions);
    const relativeFiles = files.map(
      (path) => normalizePath(relative(root, path)),
    );
    const visible = releaseVisibleFiles(root, relativeFiles);
    const trackedFilesInDirectory = relativeFiles.filter(
      (path) => visible.has(path),
    );
    if (trackedFilesInDirectory.length === 0) {
      fail(`Backend contract directory is empty or missing: ${directory}`);
    }
    paths.push(...trackedFilesInDirectory);
  }
  return [...new Set(paths)].sort();
}

async function assertRegularFile(path, label) {
  const metadata = await lstat(path).catch((error) => {
    if (error?.code === 'ENOENT') fail(`${label} is missing: ${path}`);
    throw error;
  });
  if (!metadata.isFile()) fail(`${label} must be a regular file: ${path}`);
}

function assertGitRepository(root, label) {
  const topLevel = git(['rev-parse', '--show-toplevel'], root).stdout;
  if (resolve(topLevel) !== resolve(root)) {
    fail(`${label} must be the root of its Git checkout: ${root}`);
  }
}

function assertCleanCheckout(root, label) {
  const status = git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    root,
  ).stdout;
  if (status) {
    fail(
      `${label} checkout is not clean. Release provenance requires a clean checkout:\n${status}`,
    );
  }
}

function worktreeStatus(root, paths = []) {
  const args = [
    '-c',
    'core.quotepath=false',
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
  ];
  if (paths.length > 0) args.push('--', ...paths);
  const output = git(args, root).stdout;
  return output ? output.split('\n').filter(Boolean) : [];
}

function classifyWorktreeStatus(allEntries, canonicalEntries) {
  const canonicalCounts = new Map();
  for (const entry of canonicalEntries) {
    canonicalCounts.set(entry, (canonicalCounts.get(entry) ?? 0) + 1);
  }
  const unrelated = [];
  for (const entry of allEntries) {
    const count = canonicalCounts.get(entry) ?? 0;
    if (count > 0) {
      canonicalCounts.set(entry, count - 1);
    } else {
      unrelated.push(entry);
    }
  }
  return {
    canonical: [...canonicalEntries],
    unrelated,
  };
}

function trackedFiles(root, paths) {
  const result = git(['ls-files', '-z', '--', ...paths], root);
  return new Set(result.stdout.split('\0').filter(Boolean));
}

function releaseVisibleFiles(root, paths) {
  if (paths.length === 0) return new Set();
  const result = git(
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...paths,
    ],
    root,
  );
  return new Set(result.stdout.split('\0').filter(Boolean));
}

function assertTracked(root, paths, label) {
  const tracked = trackedFiles(root, paths);
  const missing = paths.filter((path) => !tracked.has(path));
  if (missing.length > 0) {
    fail(
      `${label} contains untracked canonical files:\n${missing
        .map((path) => `- ${path}`)
        .join('\n')}`,
    );
  }
}

function assertNoTrackedQuarantineSources() {
  const tracked = trackedFiles(repositoryRoot, ['public/app']);
  if (tracked.size > 0) {
    fail(
      'public/app is a quarantined consumer/stale compiled artifact and cannot be tracked as Svelte CRM release source:\n'
      + [...tracked].sort().map((path) => `- ${path}`).join('\n'),
    );
  }
}

function readRequiredEnvironment(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) fail(`${name} is required for a release candidate.`);
  return value;
}

function validateEnvironment() {
  const environmentId = readRequiredEnvironment(
    'HUDDLEWAY_RELEASE_ENVIRONMENT',
  );
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(environmentId)) {
    fail('HUDDLEWAY_RELEASE_ENVIRONMENT must be a non-secret configuration identifier.');
  }

  const redundantPublicEnvironment = [
    'PUBLIC_BACKEND_URL',
    'PUBLIC_FIREBASE_PROJECT_ID',
    'PUBLIC_FIREBASE_USE_EMULATORS',
  ].filter((name) => String(process.env[name] ?? '').trim());
  if (redundantPublicEnvironment.length > 0) {
    fail(
      `${redundantPublicEnvironment.join(', ')} must be omitted from the release environment. `
      + 'Use the non-public HUDDLEWAY_RELEASE_* controls so Vite does not serialize '
      + 'values already fixed by the production runtime.',
    );
  }

  const backendUrl = new URL(
    readRequiredEnvironment('HUDDLEWAY_RELEASE_BACKEND_URL'),
  );
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (
    backendUrl.protocol !== 'https:'
    || loopbackHosts.has(backendUrl.hostname)
    || backendUrl.username
    || backendUrl.password
    || backendUrl.search
    || backendUrl.hash
  ) {
    fail(
      'HUDDLEWAY_RELEASE_BACKEND_URL must be a non-loopback HTTPS origin without credentials, query, or fragment.',
    );
  }

  const firebaseProjectId = readRequiredEnvironment(
    'HUDDLEWAY_RELEASE_FIREBASE_PROJECT_ID',
  );
  if (
    !/^[a-z0-9][a-z0-9-]{4,62}$/i.test(firebaseProjectId)
    || /(^|[-_])(dev|demo|test|emulator)([-_]|$)/i.test(firebaseProjectId)
  ) {
    fail('HUDDLEWAY_RELEASE_FIREBASE_PROJECT_ID must identify a non-development release project.');
  }
  const websiteCommit = readRequiredEnvironment(
    'PUBLIC_WEBSITE_COMMIT',
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(websiteCommit)) {
    fail('PUBLIC_WEBSITE_COMMIT must be a full 40-character commit SHA.');
  }
  const sourceCommit = git(['rev-parse', 'HEAD']).stdout.toLowerCase();
  if (websiteCommit !== sourceCommit) {
    fail(
      `PUBLIC_WEBSITE_COMMIT must match the checked-out release source (${sourceCommit}).`,
    );
  }
  if (
    readRequiredEnvironment('HUDDLEWAY_RELEASE_FIREBASE_USE_EMULATORS')
      .toLowerCase() !== 'false'
  ) {
    fail('HUDDLEWAY_RELEASE_FIREBASE_USE_EMULATORS must be false.');
  }
  if (
    String(process.env.PUBLIC_FIREBASE_APP_CHECK_ENABLED ?? '')
      .trim()
      .toLowerCase() !== 'true'
  ) {
    fail('PUBLIC_FIREBASE_APP_CHECK_ENABLED must be true for a release artifact.');
  }
  const appCheckSiteKey = readRequiredEnvironment(
    'PUBLIC_FIREBASE_APP_CHECK_SITE_KEY',
  );
  if (
    !/^[A-Za-z0-9_-]{20,200}$/.test(appCheckSiteKey)
    || /(fake|test|example|placeholder|changeme|dummy)/i.test(appCheckSiteKey)
  ) {
    fail(
      'PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is missing or looks like a test/placeholder value.',
    );
  }
  const expectedAppCheckSiteKeyHash = readRequiredEnvironment(
    'HUDDLEWAY_FIREBASE_APP_CHECK_SITE_KEY_SHA256',
  ).toLowerCase();
  if (
    !/^[a-f0-9]{64}$/.test(expectedAppCheckSiteKeyHash)
    || hashText(appCheckSiteKey) !== expectedAppCheckSiteKeyHash
  ) {
    fail(
      'PUBLIC_FIREBASE_APP_CHECK_SITE_KEY does not match the approved release configuration hash.',
    );
  }

  return {
    id: environmentId,
    backendOrigin: backendUrl.origin,
    firebaseProjectId,
    websiteCommit,
    firebaseEmulators: false,
    firebaseAppCheck: {
      enabled: true,
      provider: 'recaptcha-enterprise',
      siteKeySha256: expectedAppCheckSiteKeyHash,
    },
  };
}

async function validateRuntime() {
  const nodeVersion = (await readFile(
    join(repositoryRoot, '.node-version'),
    'utf8',
  )).trim();
  if (process.version !== `v${nodeVersion}`) {
    fail(
      `Release Node version mismatch: expected v${nodeVersion}, received ${process.version}.`,
    );
  }

  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const packageManager = String(packageJson.packageManager ?? '');
  const expectedNpmVersion = packageManager.match(/^npm@(.+)$/)?.[1];
  if (!expectedNpmVersion) {
    fail('package.json must pin packageManager to an exact npm version.');
  }
  const npmVersion = command('npm', ['--version']).stdout;
  if (npmVersion !== expectedNpmVersion) {
    fail(
      `Release npm version mismatch: expected ${expectedNpmVersion}, received ${npmVersion}.`,
    );
  }
  return { node: process.version, npm: npmVersion };
}

async function validateBackendContract() {
  const root = resolve(readRequiredEnvironment('HUDDLEWAY_BACKEND_ROOT'));
  const expectedCommit = readRequiredEnvironment(
    'HUDDLEWAY_BACKEND_CONTRACT_REF',
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expectedCommit)) {
    fail('HUDDLEWAY_BACKEND_CONTRACT_REF must be a full 40-character commit SHA.');
  }

  assertGitRepository(root, 'Backend contract');
  assertCleanCheckout(root, 'Backend contract');
  const actualCommit = git(['rev-parse', 'HEAD'], root).stdout.toLowerCase();
  if (actualCommit !== expectedCommit) {
    fail(
      `Backend contract checkout mismatch: expected ${expectedCommit}, received ${actualCommit}.`,
    );
  }
  const contractInputs = await backendContractInputs(root);
  assertTracked(root, contractInputs, 'Backend contract');

  const files = [];
  for (const relativePath of contractInputs) {
    const absolutePath = join(root, relativePath);
    await assertRegularFile(absolutePath, 'Backend contract file');
    const metadata = await stat(absolutePath);
    files.push({
      path: relativePath,
      sha256: await hashFile(absolutePath),
      size: metadata.size,
    });
  }

  return {
    repository: 'https://github.com/notpac93/HuddleWay',
    commit: actualCommit,
    tree: git(['rev-parse', 'HEAD^{tree}'], root).stdout,
    clean: true,
    files,
  };
}

function consumerAttestation() {
  const values = {
    releaseId: String(process.env.HUDDLEWAY_CONSUMER_RELEASE_ID ?? '').trim(),
    artifactSha256: String(
      process.env.HUDDLEWAY_CONSUMER_ARTIFACT_SHA256 ?? '',
    ).trim().toLowerCase(),
    owner: String(process.env.HUDDLEWAY_CONSUMER_OWNER ?? '').trim(),
    rollbackReleaseId: String(
      process.env.HUDDLEWAY_CONSUMER_ROLLBACK_RELEASE_ID ?? '',
    ).trim(),
  };
  const supplied = Object.values(values).filter(Boolean).length;
  if (supplied === 0) return null;
  if (
    supplied !== Object.keys(values).length
    || !/^[a-f0-9]{64}$/.test(values.artifactSha256)
  ) {
    fail(
      'Consumer app attestation requires release ID, SHA-256, owner, and rollback release ID together.',
    );
  }
  return {
    repository: 'https://github.com/notpac93/HuddleWay',
    ...values,
  };
}

async function sourceEvidence() {
  assertGitRepository(repositoryRoot, 'Website');
  assertCleanCheckout(repositoryRoot, 'Website');
  const inputs = await canonicalInputs();
  for (const relativePath of inputs) {
    await assertRegularFile(
      join(repositoryRoot, relativePath),
      'Canonical release input',
    );
  }
  assertTracked(repositoryRoot, inputs, 'Website release source');
  assertNoTrackedQuarantineSources();

  const files = [];
  for (const relativePath of inputs) {
    const absolutePath = join(repositoryRoot, relativePath);
    const metadata = await stat(absolutePath);
    files.push({
      path: relativePath,
      sha256: await hashFile(absolutePath),
      size: metadata.size,
    });
  }

  const remote = git(['remote', 'get-url', 'origin']).stdout;
  if (/https?:\/\/[^/]*@/i.test(remote)) {
    fail('The release repository remote must not contain embedded credentials.');
  }
  return {
    repository: remote,
    commit: git(['rev-parse', 'HEAD']).stdout,
    tree: git(['rev-parse', 'HEAD^{tree}']).stdout,
    commitTime: git(['show', '-s', '--format=%cI', 'HEAD']).stdout,
    clean: true,
    files,
  };
}

async function preflight() {
  const runtime = await validateRuntime();
  const environment = validateEnvironment();
  const source = await sourceEvidence();
  const backendContract = await validateBackendContract();
  const consumerApp = consumerAttestation();
  return {
    runtime,
    environment,
    source,
    backendContract,
    consumerApp,
  };
}

async function reviewCanonicalDeletions(root, inputs) {
  const rootPrefix = `${resolve(root)}${sep}`;
  for (const relativePath of inputs) {
    const absolutePath = resolve(root, relativePath);
    if (!absolutePath.startsWith(rootPrefix)) {
      fail(`Canonical deletion escapes the backend root: ${relativePath}`);
    }
    const metadata = await lstat(absolutePath).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (metadata) {
      fail(`Canonical deletion still exists: ${relativePath}`);
    }
    const tracked = git(
      ['ls-tree', '-r', '--name-only', 'HEAD', '--', relativePath],
      root,
    ).stdout;
    const trackedHistorically = tracked === relativePath
      || git(
        ['log', '-1', '--format=%H', '--all', '--', relativePath],
        root,
      ).stdout.length > 0;
    if (!trackedHistorically) {
      fail(
        `Canonical deletion has no tracked repository history: ${relativePath}`,
      );
    }
  }
  return [...inputs];
}

async function reviewInputScope(root, inputs, deletionInputs = []) {
  assertGitRepository(root, 'Review scope');
  const files = [];
  for (const relativePath of inputs) {
    const absolutePath = join(root, relativePath);
    await assertRegularFile(absolutePath, 'Canonical review input');
    const metadata = await stat(absolutePath);
    files.push({
      path: relativePath,
      sha256: await hashFile(absolutePath),
      size: metadata.size,
    });
  }
  const canonicalDeletions = await reviewCanonicalDeletions(
    root,
    deletionInputs,
  );
  const canonicalStatus = worktreeStatus(
    root,
    [...inputs, ...canonicalDeletions],
  );
  const allStatus = worktreeStatus(root);
  const classified = classifyWorktreeStatus(allStatus, canonicalStatus);
  const tracked = trackedFiles(root, inputs);
  const untrackedInputs = inputs.filter((path) => !tracked.has(path));
  const aggregateSha256 = hashText(
    files.map(({ path, sha256, size }) => `${sha256} ${size} ${path}\n`).join(''),
  );
  return {
    head: git(['rev-parse', 'HEAD'], root).stdout,
    tree: git(['rev-parse', 'HEAD^{tree}'], root).stdout,
    canonicalInputCount: files.length,
    canonicalInputBytes: files.reduce((total, file) => total + file.size, 0),
    canonicalInputSha256: aggregateSha256,
    canonicalDeletionCount: canonicalDeletions.length,
    canonicalChangeCount: classified.canonical.length,
    unrelatedChangeCount: classified.unrelated.length,
    untrackedCanonicalInputCount: untrackedInputs.length,
    cleanCandidate:
      allStatus.length === 0
      && untrackedInputs.length === 0,
    canonicalChanges: classified.canonical,
    canonicalDeletions,
    untrackedCanonicalInputs: untrackedInputs,
    canonicalInputs: files,
  };
}

async function createCandidateReviewScope(backendRoot) {
  const resolvedBackendRoot = resolve(backendRoot);
  const siteInputs = await canonicalInputs();
  const backendInputs = await backendContractInputs(resolvedBackendRoot);
  return {
    schemaVersion: 1,
    reviewOnly: true,
    mutatesGit: false,
    website: await reviewInputScope(repositoryRoot, siteInputs),
    backendContract: await reviewInputScope(
      resolvedBackendRoot,
      backendInputs,
      backendCanonicalDeletions,
    ),
  };
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) fail(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function safeOutputPath(value, fallback, label) {
  const path = resolve(value ?? fallback);
  if (path === repositoryRoot || path === resolve('/') || dirname(path) === path) {
    fail(`Refusing to use unsafe ${label} path: ${path}`);
  }
  return path;
}

async function cleanOutputs(distDirectory, manifestPath) {
  await rm(distDirectory, { recursive: true, force: true });
  await rm(manifestPath, { force: true });
  console.log(`Removed generated release outputs: ${distDirectory}`);
}

async function quarantineArtifact(distDirectory) {
  if (!(await exists(distDirectory))) {
    fail(`Build artifact does not exist: ${distDirectory}`);
  }
  const nestedApp = join(distDirectory, 'app');
  await rm(nestedApp, { recursive: true, force: true });
  await verifyQuarantine(distDirectory);
  console.log('Quarantine verified: dist/app and stale nested CRM artifacts are absent.');
}

async function artifactFiles(distDirectory) {
  const files = await walkFiles(distDirectory);
  return Promise.all(
    files
      .map((path) => ({
        absolutePath: path,
        path: normalizePath(relative(distDirectory, path)),
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(async ({ absolutePath, path }) => {
        const metadata = await stat(absolutePath);
        return {
          path,
          sha256: await hashFile(absolutePath),
          size: metadata.size,
        };
      }),
  );
}

async function verifyQuarantine(distDirectory) {
  const files = await walkFiles(distDirectory);
  const relativeFiles = files.map(
    (path) => normalizePath(relative(distDirectory, path)),
  );
  const forbidden = relativeFiles.filter(
    (path) =>
      path === 'app'
      || path.startsWith('app/')
      || path === 'index_crm.html'
      || /^_astro\/(?:CrmApp|SetupWorkflow)\.[^.]+\.js$/i.test(path)
        && path.includes('/app/'),
  );
  if (forbidden.length > 0) {
    fail(
      `Quarantined compiled application files are present in the release artifact:\n${forbidden
        .map((path) => `- ${path}`)
        .join('\n')}`,
    );
  }

  for (const route of ['admin/index.html', 'admin/setup/index.html']) {
    const routePath = join(distDirectory, route);
    await assertRegularFile(routePath, 'Canonical CRM route');
    const html = await readFile(routePath, 'utf8');
    if (/(?:src|href)=["'][^"']*\/app\/(?:admin|_astro)\//i.test(html)) {
      fail(`${route} references a quarantined nested CRM artifact.`);
    }
  }
}

async function assertLocalAssetReferences(distDirectory) {
  const htmlFiles = (await walkFiles(distDirectory, ['.html']));
  const missing = [];
  const unsafe = [];
  for (const htmlPath of htmlFiles) {
    const html = await readFile(htmlPath, 'utf8');
    for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)) {
      const reference = match[1];
      if (!reference.startsWith('/')) continue;
      let decoded;
      try {
        decoded = decodeURIComponent(reference);
      } catch {
        unsafe.push(`${normalizePath(relative(distDirectory, htmlPath))}: ${reference}`);
        continue;
      }
      if (decoded.includes('..') || decoded.includes('\\')) {
        unsafe.push(`${normalizePath(relative(distDirectory, htmlPath))}: ${reference}`);
        continue;
      }
      const target = join(distDirectory, decoded.replace(/^\/+/, ''));
      if (!(await exists(target))) {
        missing.push(`${normalizePath(relative(distDirectory, htmlPath))}: ${reference}`);
      }
    }
  }
  if (unsafe.length > 0) {
    fail(`Unsafe local artifact references found:\n${unsafe.join('\n')}`);
  }
  if (missing.length > 0) {
    fail(`Broken local artifact references found:\n${missing.join('\n')}`);
  }
}

async function artifactReferencesConsumerApp(distDirectory) {
  const textFiles = await walkFiles(distDirectory, ['.html', '.js', '.css', '.json']);
  for (const path of textFiles) {
    const contents = await readFile(path, 'utf8');
    if (/["'(]\/app(?:\/|["')?#])/i.test(contents)) return true;
  }
  return false;
}

async function createManifest(distDirectory, manifestPath) {
  await verifyQuarantine(distDirectory);
  await assertLocalAssetReferences(distDirectory);
  const evidence = await preflight();
  const referencesConsumerApp = await artifactReferencesConsumerApp(distDirectory);
  if (referencesConsumerApp && !evidence.consumerApp) {
    fail(
      'The Svelte artifact references /app but no separately produced consumer-app attestation was supplied.',
    );
  }

  const files = await artifactFiles(distDirectory);
  const artifactDigest = hashText(
    files.map(({ path, sha256, size }) => `${sha256} ${size} ${path}\n`).join(''),
  );
  const manifest = {
    schemaVersion: 1,
    artifact: {
      format: 'astro-static-directory',
      root: 'dist',
      sha256: artifactDigest,
      files,
      routes: ['/admin/', '/admin/setup/'],
      quarantine: {
        nestedAppExcluded: true,
        staleCompiledCrmExcluded: true,
        consumerAppReferenced: referencesConsumerApp,
      },
    },
    source: evidence.source,
    backendContract: evidence.backendContract,
    consumerApp: evidence.consumerApp,
    environment: evidence.environment,
    toolchain: {
      ...evidence.runtime,
      packageLockSha256: await hashFile(join(repositoryRoot, 'package-lock.json')),
    },
    commands: releaseCommands,
  };

  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Release manifest written: ${manifestPath}`);
  console.log(`Artifact SHA-256: ${manifest.artifact.sha256}`);
}

async function verifyFileEntries(root, expected, label) {
  const actual = await artifactFiles(root);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} file inventory or checksum does not match its manifest.`);
  }
}

async function verifyManifest(distDirectory, manifestPath) {
  await assertRegularFile(manifestPath, 'Release manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1) fail('Unsupported release manifest schema.');
  if (manifest.artifact?.root !== 'dist') fail('Unexpected artifact root.');
  if (manifest.source?.clean !== true || manifest.backendContract?.clean !== true) {
    fail('Release manifest must attest clean source and backend checkouts.');
  }
  if (JSON.stringify(manifest.commands) !== JSON.stringify(releaseCommands)) {
    fail('Release command inventory does not match the enforced release pipeline.');
  }

  await verifyQuarantine(distDirectory);
  await assertLocalAssetReferences(distDirectory);
  await verifyFileEntries(
    distDirectory,
    manifest.artifact.files,
    'Artifact',
  );
  const expectedDigest = hashText(
    manifest.artifact.files
      .map(({ path, sha256, size }) => `${sha256} ${size} ${path}\n`)
      .join(''),
  );
  if (expectedDigest !== manifest.artifact.sha256) {
    fail('Artifact aggregate checksum is invalid.');
  }

  const evidence = await preflight();
  if (
    JSON.stringify(evidence.source) !== JSON.stringify(manifest.source)
    || JSON.stringify(evidence.backendContract)
      !== JSON.stringify(manifest.backendContract)
    || JSON.stringify(evidence.environment) !== JSON.stringify(manifest.environment)
    || JSON.stringify(evidence.consumerApp) !== JSON.stringify(manifest.consumerApp)
  ) {
    fail('Manifest provenance no longer matches the checked-out release inputs.');
  }
  const referencesConsumerApp = await artifactReferencesConsumerApp(distDirectory);
  if (referencesConsumerApp !== manifest.artifact.quarantine.consumerAppReferenced) {
    fail('Consumer-app reference state does not match the release manifest.');
  }
  if (referencesConsumerApp && !manifest.consumerApp) {
    fail('Consumer-app reference is not separately attested.');
  }
  console.log(`Release artifact verified: ${manifest.artifact.sha256}`);
}

async function main() {
  const [subcommand, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  const distDirectory = safeOutputPath(
    options.dist,
    defaultDistDirectory,
    'artifact',
  );
  const manifestPath = safeOutputPath(
    options.manifest,
    defaultManifestPath,
    'manifest',
  );

  switch (subcommand) {
    case 'preflight':
      await preflight();
      console.log('Release source, environment, toolchain, and backend provenance verified.');
      break;
    case 'clean':
      await cleanOutputs(distDirectory, manifestPath);
      break;
    case 'quarantine':
      await quarantineArtifact(distDirectory);
      break;
    case 'manifest':
      await createManifest(distDirectory, manifestPath);
      break;
    case 'verify':
      await verifyManifest(distDirectory, manifestPath);
      break;
    case 'scope': {
      const backendRoot =
        options['backend-root']
        ?? process.env.HUDDLEWAY_BACKEND_ROOT
        ?? resolve(repositoryRoot, '../../HuddleWay');
      console.log(JSON.stringify(
        await createCandidateReviewScope(backendRoot),
        null,
        2,
      ));
      break;
    }
    default:
      fail(
        'Usage: crm-release.mjs <preflight|scope|clean|quarantine|manifest|verify> [--backend-root PATH] [--dist PATH] [--manifest PATH]',
      );
  }
}

export {
  backendContractInputs,
  backendCanonicalDeletions,
  canonicalInputs,
  classifyWorktreeStatus,
  createCandidateReviewScope,
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`CRM release gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
