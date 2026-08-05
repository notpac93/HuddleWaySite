import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  acceptanceDigest,
  validateExternalReleaseEvidence,
  verifyAcceptanceReceipt,
} from '../../scripts/release/crm-external-evidence.mjs';

const NOW = Date.parse('2026-07-27T04:00:00.000Z');
const WEBSITE_COMMIT = '1'.repeat(40);
const BACKEND_COMMIT = '2'.repeat(40);
const ARTIFACT_SHA = '3'.repeat(64);
const EVIDENCE_SHA = '4'.repeat(64);

function timestamp(milliseconds: number) {
  return new Date(milliseconds).toISOString();
}

function releaseManifest() {
  return {
    schemaVersion: 1,
    artifact: { sha256: ARTIFACT_SHA },
    source: { commit: WEBSITE_COMMIT },
    backendContract: { commit: BACKEND_COMMIT },
    environment: { id: 'production-candidate' },
  };
}

function externalEvidence() {
  return {
    schemaVersion: 1,
    release: {
      releaseId: 'crm-prod-2026-07-27.1',
      environment: 'production-candidate',
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      artifactSha256: ARTIFACT_SHA,
    },
    backupRecovery: {
      accepted: true,
      evidenceId: 'recovery-receipt-20260727',
      completedAt: timestamp(NOW - 60 * 60 * 1000),
      encryptedArtifactSha256: '5'.repeat(64),
      bundleSha256: '6'.repeat(64),
      targetProjectId: 'huddleway-dev',
      firestore: {
        sourceDocuments: 41,
        restoredDocuments: 41,
        verifiedDocuments: 41,
        rollbackRemainingDocuments: 0,
      },
      storage: {
        sourceObjects: 7,
        sourceBytes: 2048,
        restoredObjects: 7,
        verifiedObjects: 7,
        rollbackRemainingObjects: 0,
      },
      rtoMinutes: 18,
      rpoHours: 2,
      operatorApprovals: ['notpac93'],
    },
    monitoring: {
      accepted: true,
      evidenceId: 'monitoring-receipt-20260727',
      completedAt: timestamp(NOW - 2 * 60 * 60 * 1000),
      provider: 'google-cloud-logging',
      savedQueries: [
        'backup-freshness',
        'cross-tenant-denial-regression',
        'migration-failure',
        'webhook-failure-rate',
        'webhook-reconciliation-backlog',
      ],
      alertReceipts: [
        'backend-health',
        'backup-freshness',
        'webhook-failure-rate',
        'webhook-reconciliation-backlog',
      ],
      correlationLookupVerified: true,
      ownerAcknowledged: true,
    },
    appCheck: {
      accepted: true,
      evidenceId: 'app-check-receipt-20260727',
      completedAt: timestamp(NOW - 2 * 60 * 60 * 1000),
      mode: 'monitor',
      monitoringHours: 48,
      nonInteractiveCallerInventoryAccepted: true,
      correlatedDenialUxAccepted: true,
      enforcementApproved: false,
      enforcementEnabled: false,
      providers: [
        {
          consumer: 'web',
          provider: 'recaptcha-enterprise',
          evidenceId: 'app-check-web-evidence',
          successfulRuns: 3,
        },
        {
          consumer: 'android',
          provider: 'play-integrity',
          evidenceId: 'app-check-android-evidence',
          successfulRuns: 3,
        },
      ],
    },
    performance: {
      accepted: true,
      evidenceId: 'performance-receipt-20260727',
      completedAt: timestamp(NOW - 30 * 60 * 1000),
      targetOrigin: 'https://stage.huddleway.com',
      authenticated: true,
      noCustomerPayloads: true,
      observationMode: 'authenticated-synthetic-canary',
      customerActivityClaimed: false,
      rum: {
        windowStartedAt: timestamp(NOW - 49 * 60 * 60 * 1000),
        windowEndedAt: timestamp(NOW - 60 * 60 * 1000),
        desktop: {
          samples: 100,
          lcpMs: 1800,
          inpMs: 120,
          cls: 0.04,
        },
        mobile: {
          samples: 100,
          lcpMs: 2300,
          inpMs: 180,
          cls: 0.08,
        },
      },
      cdn: {
        assetSamples: 5,
        brotliVerified: true,
        gzipVerified: true,
        fingerprintedImmutableCacheVerified: true,
        warmCacheHitVerified: true,
      },
      edge: {
        samplesPerClass: 30,
        desktopP75Ms: 600,
        mobileP75Ms: 900,
      },
      media: {
        fixtureObjects: 2,
        responsiveWidths: [320, 640, 1280],
        modernFormats: ['webp'],
        immutableCacheVerified: true,
        sourceDerivativeIsolationVerified: true,
      },
    },
    releaseGovernance: {
      mode: 'single-developer',
      ownerId: 'notpac93',
      approvedSurfaces: ['android', 'web'],
      automatedValidationRequired: true,
      productionConfirmationRequired: true,
    },
    deploymentApproval: {
      approved: true,
      target: 'porkbun-huddleway-static',
      windowStartsAt: timestamp(NOW - 30 * 60 * 1000),
      windowEndsAt: timestamp(NOW + 2 * 60 * 60 * 1000),
      rollbackReleaseId: 'crm-prod-2026-07-20.1',
      rollbackArtifactSha256: '7'.repeat(64),
      approverIds: ['notpac93'],
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe('CRM external release evidence', () => {
  it('binds every accepted external gate to one release artifact', () => {
    const receipt = validateExternalReleaseEvidence(
      externalEvidence(),
      releaseManifest(),
      { now: NOW, externalEvidenceSha256: EVIDENCE_SHA },
    );

    expect(receipt.status).toBe('accepted');
    expect(receipt.release).toMatchObject({
      websiteCommit: WEBSITE_COMMIT,
      backendCommit: BACKEND_COMMIT,
      artifactSha256: ARTIFACT_SHA,
    });
    expect(receipt.gates.backupRecovery).toMatchObject({
      firestoreDocuments: 41,
      storageObjects: 7,
      storageBytes: 2048,
    });
    expect(receipt.gates.appCheck.providers.map((entry: { consumer: string }) =>
      entry.consumer).sort()).toEqual(['android', 'web']);
    expect(receipt.acceptanceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      verifyAcceptanceReceipt(receipt, releaseManifest(), EVIDENCE_SHA))
      .not.toThrow();
  });

  it('rejects evidence for a different source, backend, or artifact', () => {
    for (const field of ['websiteCommit', 'backendCommit', 'artifactSha256']) {
      const evidence = externalEvidence();
      (evidence.release as Record<string, unknown>)[field] =
        field === 'artifactSha256' ? '8'.repeat(64) : '8'.repeat(40);
      expect(() =>
        validateExternalReleaseEvidence(evidence, releaseManifest(), {
          now: NOW,
          externalEvidenceSha256: EVIDENCE_SHA,
        })).toThrow(/does not match/i);
    }
  });

  it('requires a fresh encrypted non-production Firestore and Storage drill', () => {
    const stale = externalEvidence();
    stale.backupRecovery.completedAt = timestamp(
      NOW - 27 * 60 * 60 * 1000,
    );
    expect(() =>
      validateExternalReleaseEvidence(stale, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/too old/i);

    const production = externalEvidence();
    production.backupRecovery.targetProjectId = 'sports-team-apps';
    expect(() =>
      validateExternalReleaseEvidence(production, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/production Firebase project/i);

    const incompleteStorage = externalEvidence();
    incompleteStorage.backupRecovery.storage.verifiedObjects = 6;
    expect(() =>
      validateExternalReleaseEvidence(incompleteStorage, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/Storage readback count/i);
  });

  it('requires every monitoring query, alert receipt, and correlation lookup', () => {
    const evidence = externalEvidence();
    evidence.monitoring.savedQueries.pop();
    expect(() =>
      validateExternalReleaseEvidence(evidence, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/must contain exactly/i);

    const unsafe = externalEvidence() as ReturnType<typeof externalEvidence> & {
      monitoring: ReturnType<typeof externalEvidence>['monitoring'] & {
        providerPayload?: string;
      };
    };
    unsafe.monitoring.providerPayload = 'must-not-be-accepted';
    expect(() =>
      validateExternalReleaseEvidence(unsafe, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/must contain exactly/i);
  });

  it('requires the approved Android and web App Check providers only', () => {
    const missingWeb = externalEvidence();
    missingWeb.appCheck.providers.pop();
    expect(() =>
      validateExternalReleaseEvidence(missingWeb, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/must contain exactly/i);

    const unexpectedIos = externalEvidence();
    unexpectedIos.appCheck.providers.push({
      consumer: 'ios',
      provider: 'app-attest',
      evidenceId: 'unapproved-ios-evidence',
      successfulRuns: 3,
    });
    expect(() =>
      validateExternalReleaseEvidence(unexpectedIos, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/approved provider/i);

    const wrongWebProvider = externalEvidence();
    wrongWebProvider.appCheck.providers[1].provider = 'debug';
    expect(() =>
      validateExternalReleaseEvidence(wrongWebProvider, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/approved provider/i);

    const unapprovedEnforcement = externalEvidence();
    unapprovedEnforcement.appCheck.mode = 'enforce';
    unapprovedEnforcement.appCheck.enforcementEnabled = true;
    expect(() =>
      validateExternalReleaseEvidence(
        unapprovedEnforcement,
        releaseManifest(),
        { now: NOW, externalEvidenceSha256: EVIDENCE_SHA },
      )).toThrow(/explicit approval/i);
  });

  it('enforces honest synthetic-canary, edge, CDN, and media budgets', () => {
    const customerClaim = externalEvidence();
    customerClaim.performance.customerActivityClaimed = true;
    expect(() =>
      validateExternalReleaseEvidence(customerClaim, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/must be false/i);

    const mislabeledFieldTraffic = externalEvidence();
    mislabeledFieldTraffic.performance.observationMode = 'field-rum';
    expect(() =>
      validateExternalReleaseEvidence(mislabeledFieldTraffic, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/authenticated-synthetic-canary/i);

    const slow = externalEvidence();
    slow.performance.rum.mobile.lcpMs = 2501;
    expect(() =>
      validateExternalReleaseEvidence(slow, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/between 0 and 2500/i);

    const notImmutable = externalEvidence();
    notImmutable.performance.cdn.fingerprintedImmutableCacheVerified = false;
    expect(() =>
      validateExternalReleaseEvidence(notImmutable, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/must be true/i);

    const noModernDerivative = externalEvidence();
    noModernDerivative.performance.media.modernFormats = ['jpeg'];
    expect(() =>
      validateExternalReleaseEvidence(
        noModernDerivative,
        releaseManifest(),
        { now: NOW, externalEvidenceSha256: EVIDENCE_SHA },
      )).toThrow(/AVIF or WebP/i);
  });

  it('requires explicit single-owner governance and final owner approval', () => {
    const noAutomatedValidation = externalEvidence();
    noAutomatedValidation.releaseGovernance.automatedValidationRequired = false;
    expect(() =>
      validateExternalReleaseEvidence(noAutomatedValidation, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/must be true/i);

    const unexpectedSurface = externalEvidence();
    unexpectedSurface.releaseGovernance.approvedSurfaces.push('ios');
    expect(() =>
      validateExternalReleaseEvidence(unexpectedSurface, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/must contain exactly/i);

    const differentApprover = externalEvidence();
    differentApprover.deploymentApproval.approverIds = ['someone-else'];
    expect(() =>
      validateExternalReleaseEvidence(differentApprover, releaseManifest(), {
        now: NOW,
        externalEvidenceSha256: EVIDENCE_SHA,
      })).toThrow(/owner must explicitly approve/i);
  });

  it('detects receipt tampering independently of the private evidence file', () => {
    const receipt = validateExternalReleaseEvidence(
      externalEvidence(),
      releaseManifest(),
      { now: NOW, externalEvidenceSha256: EVIDENCE_SHA },
    );
    const tampered = clone(receipt);
    tampered.gates.performance.rum.mobile.lcpMs = 2400;
    expect(() =>
      verifyAcceptanceReceipt(tampered, releaseManifest(), EVIDENCE_SHA))
      .toThrow(/checksum is invalid/i);

    const body = clone(receipt);
    delete (body as Partial<typeof receipt>).acceptanceSha256;
    expect(receipt.acceptanceSha256).toBe(acceptanceDigest(body));
  });

  it('is no longer wired into the single-developer production workflow', async () => {
    const workflow = await readFile(
      resolve('.github/workflows/crm-production-deploy.yml'),
      'utf8',
    );
    const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));

    expect(workflow).toContain('name: CRM single-developer production deployment');
    expect(workflow).not.toContain('CRM_EXTERNAL_RELEASE_EVIDENCE_JSON');
    expect(workflow).not.toContain('crm-production-acceptance.yml');
    expect(workflow).not.toContain('actions/attest@');
    expect(packageJson.scripts['release:acceptance']).toBeUndefined();
    expect(packageJson.scripts['release:acceptance:verify']).toBeUndefined();
  });

  it('requires the separately approved evidence-file hash at the CLI boundary', async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'huddleway-release-evidence-'),
    );
    try {
      const runtimeNow = Date.now();
      const evidence = externalEvidence();
      evidence.backupRecovery.completedAt = timestamp(
        runtimeNow - 60 * 60 * 1000,
      );
      evidence.monitoring.completedAt = timestamp(
        runtimeNow - 2 * 60 * 60 * 1000,
      );
      evidence.appCheck.completedAt = timestamp(
        runtimeNow - 2 * 60 * 60 * 1000,
      );
      evidence.performance.completedAt = timestamp(
        runtimeNow - 30 * 60 * 1000,
      );
      evidence.performance.rum.windowStartedAt = timestamp(
        runtimeNow - 49 * 60 * 60 * 1000,
      );
      evidence.performance.rum.windowEndedAt = timestamp(
        runtimeNow - 60 * 60 * 1000,
      );
      evidence.deploymentApproval.windowStartsAt = timestamp(
        runtimeNow - 30 * 60 * 1000,
      );
      evidence.deploymentApproval.windowEndsAt = timestamp(
        runtimeNow + 2 * 60 * 60 * 1000,
      );

      const evidencePath = join(temporaryDirectory, 'evidence.json');
      const manifestPath = join(temporaryDirectory, 'manifest.json');
      const receiptPath = join(temporaryDirectory, 'receipt.json');
      const evidenceBytes = Buffer.from(`${JSON.stringify(evidence)}\n`);
      const evidenceSha256 = createHash('sha256')
        .update(evidenceBytes)
        .digest('hex');
      await writeFile(evidencePath, evidenceBytes, { mode: 0o600 });
      await writeFile(
        manifestPath,
        `${JSON.stringify(releaseManifest())}\n`,
      );

      const scriptPath = resolve(
        'scripts/release/crm-external-evidence.mjs',
      );
      const accepted = spawnSync(
        process.execPath,
        [
          scriptPath,
          'accept',
          '--manifest',
          manifestPath,
          '--evidence',
          evidencePath,
          '--out',
          receiptPath,
          '--expected-sha256',
          evidenceSha256,
        ],
        { encoding: 'utf8' },
      );
      expect(accepted.status, accepted.stderr).toBe(0);
      expect(
        JSON.parse(await readFile(receiptPath, 'utf8')).externalEvidenceSha256,
      ).toBe(evidenceSha256);

      const rejected = spawnSync(
        process.execPath,
        [
          scriptPath,
          'accept',
          '--manifest',
          manifestPath,
          '--evidence',
          evidencePath,
          '--out',
          join(temporaryDirectory, 'rejected.json'),
          '--expected-sha256',
          'f'.repeat(64),
        ],
        { encoding: 'utf8' },
      );
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toMatch(/does not match/i);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
