import { describe, expect, it } from 'vitest';
import {
  AUTHORITATIVE_SEED_RELATIVE_PATH,
  assertSafeCrmSeedTarget,
  buildCrmSeedCommand,
} from '../fixtures/crmEmulatorSeed';

describe('CRM emulator seed safety', () => {
  it('builds the deterministic command for the authoritative backend fixture', () => {
    const command = buildCrmSeedCommand({
      appRoot: '/workspace/HuddleWay',
      emulatorHost: '127.0.0.1:8080',
    });

    expect(command.scriptPath).toBe(
      `/workspace/HuddleWay/${AUTHORITATIVE_SEED_RELATIVE_PATH}`,
    );
    expect(command.args).toEqual([
      command.scriptPath,
      '--project',
      'demo-huddleway-crm',
      '--tenant',
      'crm-release-fixture',
    ]);
    expect(command.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080');
  });

  it.each([
    {
      name: 'missing emulator',
      target: { emulatorHost: '', projectId: 'demo-huddleway-crm', tenantId: 'crm-release-fixture' },
    },
    {
      name: 'remote emulator',
      target: { emulatorHost: 'firestore.example.com:8080', projectId: 'demo-huddleway-crm', tenantId: 'crm-release-fixture' },
    },
    {
      name: 'real development project',
      target: { emulatorHost: 'localhost:8080', projectId: 'huddleway-dev', tenantId: 'crm-release-fixture' },
    },
    {
      name: 'customer-like tenant',
      target: { emulatorHost: 'localhost:8080', projectId: 'demo-huddleway-crm', tenantId: 'northstar-sports' },
    },
  ])('rejects $name', ({ target }) => {
    expect(() => assertSafeCrmSeedTarget(target)).toThrow();
  });

  it('accepts only an explicit loopback demo fixture target', () => {
    expect(
      assertSafeCrmSeedTarget({
        emulatorHost: 'http://localhost:8080',
        projectId: 'demo-huddleway-crm',
        tenantId: 'test-tenant-001',
      }),
    ).toEqual({
      emulatorHost: 'localhost:8080',
      projectId: 'demo-huddleway-crm',
      tenantId: 'test-tenant-001',
    });
  });
});
