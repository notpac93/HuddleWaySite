import { describe, expect, it } from 'vitest';
import { seedCanonicalCrmEmulator } from '../fixtures/crmEmulatorSeed';

const runEmulatorTests = process.env.RUN_FIREBASE_EMULATOR_TESTS === '1';

describe.skipIf(!runEmulatorTests)('live Firestore emulator fixture seed', () => {
  it('loads the authoritative deterministic CRM fixture tenant', async () => {
    await expect(
      seedCanonicalCrmEmulator({
        emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
      }),
    ).resolves.toEqual({
      success: true,
      projectId: 'demo-huddleway-crm',
      tenantId: 'crm-release-fixture',
    });
  });
});
