import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  seedCanonicalCrmEmulator,
  type SeedCommandRunner,
} from '../fixtures/crmEmulatorSeed';

describe('authoritative CRM seed adapter', () => {
  it('invokes only the guarded backend seed and validates its result', async () => {
    const appRoot = await mkdtemp(join(tmpdir(), 'huddleway-seed-adapter-'));
    const scriptDirectory = join(appRoot, 'backend', 'scripts');
    await mkdir(scriptDirectory, { recursive: true });
    await writeFile(
      join(scriptDirectory, 'seed_crm_release_fixtures.js'),
      '// test sentinel; the injected runner does not execute this file\n',
      'utf8',
    );

    const runner: SeedCommandRunner = vi.fn(async (command) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        success: true,
        projectId: command.projectId,
        tenantId: command.tenantId,
      }),
    }));

    await expect(
      seedCanonicalCrmEmulator(
        {
          appRoot,
          emulatorHost: '127.0.0.1:8080',
          projectId: 'demo-huddleway-crm',
          tenantId: 'crm-release-fixture',
        },
        runner,
      ),
    ).resolves.toEqual({
      success: true,
      projectId: 'demo-huddleway-crm',
      tenantId: 'crm-release-fixture',
    });

    expect(runner).toHaveBeenCalledOnce();
  });
});
