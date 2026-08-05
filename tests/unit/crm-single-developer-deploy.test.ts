import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  inventoryDirectory,
  stage,
} from '../../scripts/release/crm-single-developer-deploy.mjs';

const WEBSITE_COMMIT = '1'.repeat(40);
const BACKEND_COMMIT = '2'.repeat(40);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true })),
  );
});

describe('single-developer deployment staging', () => {
  it('replaces the static target and records the rollback inventory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'huddleway-single-developer-'));
    temporaryDirectories.push(root);
    const source = join(root, 'dist');
    const target = join(root, 'target');
    const output = join(root, '.release', 'plan.json');
    await mkdir(join(source, 'admin'), { recursive: true });
    await mkdir(join(target, '.git'), { recursive: true });
    await writeFile(join(source, 'admin', 'index.html'), '<html>CRM</html>');
    await writeFile(join(target, 'old.html'), 'old');

    const rollback = await inventoryDirectory(target);
    const plan = await stage({
      source,
      target,
      'website-commit': WEBSITE_COMMIT,
      'backend-commit': BACKEND_COMMIT,
      'release-id': 'github-run-123456',
      out: output,
    });

    expect(plan.mode).toBe('single-developer');
    expect(plan.rollback.artifactSha256).toBe(rollback.sha256);
    expect(await readFile(join(target, 'admin', 'index.html'), 'utf8'))
      .toBe('<html>CRM</html>');
    await expect(readFile(join(target, 'old.html'), 'utf8')).rejects.toThrow();
    const marker = JSON.parse(await readFile(
      join(target, '.well-known', 'huddleway-crm-release.json'),
      'utf8',
    ));
    expect(marker.websiteCommit).toBe(WEBSITE_COMMIT);
    expect(marker.backendCommit).toBe(BACKEND_COMMIT);
  });
});
