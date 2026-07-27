import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const AUTHORITATIVE_SEED_RELATIVE_PATH =
  'backend/scripts/seed_crm_release_fixtures.js';
export const DEFAULT_TEST_PROJECT_ID = 'demo-huddleway-crm';
export const DEFAULT_TEST_TENANT_ID = 'crm-release-fixture';

const websiteRoot = fileURLToPath(new URL('../..', import.meta.url));
const defaultAppRoot = resolve(websiteRoot, '..', '..', 'HuddleWay');
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export interface CrmSeedOptions {
  appRoot?: string;
  emulatorHost?: string;
  projectId?: string;
  tenantId?: string;
}

export interface SeedCommand {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  scriptPath: string;
  projectId: string;
  tenantId: string;
}

export interface SeedResult {
  success: true;
  projectId: string;
  tenantId: string;
}

export type SeedCommandRunner = (command: SeedCommand) => Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

function normalizeEmulatorHost(value: string) {
  const raw = value.trim();
  if (!raw) {
    throw new Error('FIRESTORE_EMULATOR_HOST is required for CRM fixture seeding.');
  }

  const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`);
  if (
    parsed.protocol !== 'http:'
    || !loopbackHosts.has(parsed.hostname)
    || !parsed.port
    || parsed.username
    || parsed.password
  ) {
    throw new Error(
      `CRM fixture seeding requires a loopback Firestore emulator host with a port. Received: ${raw}`,
    );
  }

  return parsed.host;
}

export function assertSafeCrmSeedTarget({
  emulatorHost,
  projectId = DEFAULT_TEST_PROJECT_ID,
  tenantId = DEFAULT_TEST_TENANT_ID,
}: CrmSeedOptions) {
  const safeEmulatorHost = normalizeEmulatorHost(
    emulatorHost ?? process.env.FIRESTORE_EMULATOR_HOST ?? '',
  );
  const safeProjectId = projectId.trim();
  const safeTenantId = tenantId.trim();

  if (!/^demo-[a-z0-9][a-z0-9-]*$/i.test(safeProjectId)) {
    throw new Error(
      `CRM fixture seeding requires a demo-* Firebase project ID. Received: ${safeProjectId || '(empty)'}`,
    );
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(safeTenantId)
    || !/(^|[-_])(fixture|test)([-_]|$)/i.test(safeTenantId)
  ) {
    throw new Error(
      `CRM fixture seeding requires an explicit fixture/test tenant ID. Received: ${safeTenantId || '(empty)'}`,
    );
  }

  return {
    emulatorHost: safeEmulatorHost,
    projectId: safeProjectId,
    tenantId: safeTenantId,
  };
}

export function buildCrmSeedCommand(options: CrmSeedOptions = {}): SeedCommand {
  const safeTarget = assertSafeCrmSeedTarget(options);
  const appRoot = resolve(
    options.appRoot
      ?? process.env.HUDDLEWAY_APP_ROOT
      ?? defaultAppRoot,
  );
  const scriptPath = resolve(appRoot, AUTHORITATIVE_SEED_RELATIVE_PATH);

  return {
    command: process.execPath,
    args: [
      scriptPath,
      '--project',
      safeTarget.projectId,
      '--tenant',
      safeTarget.tenantId,
    ],
    cwd: resolve(appRoot, 'backend'),
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: safeTarget.emulatorHost,
      GCLOUD_PROJECT: safeTarget.projectId,
    },
    scriptPath,
    projectId: safeTarget.projectId,
    tenantId: safeTarget.tenantId,
  };
}

const defaultRunner: SeedCommandRunner = (seedCommand) =>
  new Promise((resolveResult) => {
    const child = spawn(seedCommand.command, seedCommand.args, {
      cwd: seedCommand.cwd,
      env: seedCommand.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (exitCode) => {
      resolveResult({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });

export async function seedCanonicalCrmEmulator(
  options: CrmSeedOptions = {},
  runner: SeedCommandRunner = defaultRunner,
): Promise<SeedResult> {
  const seedCommand = buildCrmSeedCommand(options);
  await access(seedCommand.scriptPath);
  const result = await runner(seedCommand);

  if (result.exitCode !== 0) {
    throw new Error(
      `Authoritative CRM fixture seed failed with exit code ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }

  const parsed = JSON.parse(result.stdout) as SeedResult;
  if (
    parsed.success !== true
    || parsed.projectId !== seedCommand.projectId
    || parsed.tenantId !== seedCommand.tenantId
  ) {
    throw new Error('Authoritative CRM fixture seed returned an unexpected result.');
  }
  return parsed;
}
