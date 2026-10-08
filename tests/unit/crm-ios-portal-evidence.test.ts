import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acceptanceDigest, validateExternalReleaseEvidence, verifyAcceptanceReceipt } from '../../scripts/release/crm-external-evidence.mjs';
import { scopedContract, scopedReviewSubject, validateScopedExternalEvidence, verifyScopedReceipt } from '../../scripts/release/crm-ios-portal-evidence.mjs';
import { STAGE_CANARY } from '../../scripts/release/crm-stage-canary-contract.mjs';

const NOW = Date.parse('2026-10-07T13:00:00.000Z');
const stamp = (hours: number) => new Date(NOW - hours * 3600000).toISOString();
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture(phase = 'preproduction', now = NOW) {
  const stamp = (hours: number) => new Date(now - hours * 3600000).toISOString();
  const stage = phase === 'preproduction'; const scope = scopedContract(phase);
  const release = { releaseId: 'synthetic-unit-release-20261007', environment: stage ? 'stage-canary' : 'production-candidate',
    websiteCommit: '1'.repeat(40), backendCommit: '2'.repeat(40), artifactSha256: sha('synthetic artifact') };
  const artifactBody = { schemaVersion: stage ? 2 : 3, validationScope: scope, releaseId: release.releaseId, verdict: 'ready', counts: { issueCount: 0 },
    sourceManifests: { app_backend: { candidateSha: release.backendCommit }, crm_web: { candidateSha: release.websiteCommit } },
    localArtifacts: [{ key: 'crm_web_bundle', exists: true, actualSha256: release.artifactSha256, expectedSha256: release.artifactSha256 }] };
  const appBody = { schemaVersion: 3, evidenceType: 'firebase-app-check-monitor', validationScope: scope, project: { projectId: scope.projectId },
    generatedAt: stamp(0.1), window: { startedAt: stamp(25), endedAt: stamp(1), hours: 24, settlingDelayMinutes: 15 },
    apps: [{ label: 'ios-consumer', bundleId: 'com.sportsweb.sportswebApp' }, { label: 'ios-admin', bundleId: 'com.sportsweb.sportswebAdmin' }, { label: 'web' },
      { label: 'ios-parity-excluded', excluded: true }, { label: 'android-excluded', excluded: true }],
    providers: ['ios-consumer', 'ios-admin'].flatMap((app) => ['app-attest', 'device-check'].map((provider) => ({ app, provider, configured: true })))
      .concat([{ app: 'web', provider: 'recaptcha-enterprise', configured: true }]),
    decision: { consumerPolicy: { required: ['ios', 'web'], excluded: ['android'], waived: [], waiverReference: null },
      monitoringAccepted: true, providerRegistrationComplete: true, monitorOnly: true, monitorConfigurationPrecedesWindow: true,
      customBackendTelemetryCovered: true, customBackendMonitoringAccepted: true, verifiedRatio: 1, unidentifiedValidRequests: 0, validRunsByConsumerClass: { ios: 4, web: 3 } },
    customBackend: { resourceType: stage ? 'cloud_run_revision' : 'render_service', telemetryCovered: true, monitoringAccepted: true,
      verifiedRatio: 1, unidentifiedValidRequests: 0, validRunsByConsumerClass: { ios: 4, web: 3 } } };
  const observed = { artifactReport: { ...artifactBody, artifactManifestDigest: sha(JSON.stringify(artifactBody)) },
    appCheckReport: { ...appBody, evidenceSha256: acceptanceDigest(appBody) }, ownerAuthorizationDigest: sha('synthetic actual owner file'), technicalReviewDigest: sha('synthetic actual review file') };
  const evidence: any = { schemaVersion: 2, validationScope: scope, release,
    backupRecovery: { accepted: true, evidenceId: 'synthetic-recovery-001', completedAt: stamp(1), encryptedArtifactSha256: sha('encrypted artifact'), bundleSha256: sha('bundle'),
      targetProjectId: 'huddleway-dev', firestore: { sourceDocuments: 41, restoredDocuments: 41, verifiedDocuments: 41, rollbackRemainingDocuments: 0 },
      storage: { sourceObjects: 7, sourceBytes: 2048, restoredObjects: 7, verifiedObjects: 7, rollbackRemainingObjects: 0 }, rtoMinutes: 18, rpoHours: 2, operatorApprovals: ['synthetic-owner'] },
    monitoring: { accepted: true, evidenceId: 'synthetic-monitoring-001', completedAt: stamp(1), provider: 'google-cloud-logging',
      savedQueries: ['backup-freshness', 'cross-tenant-denial-regression', 'migration-failure', 'webhook-failure-rate', 'webhook-reconciliation-backlog'],
      alertReceipts: ['backend-health', 'backup-freshness', 'webhook-failure-rate', 'webhook-reconciliation-backlog'], correlationLookupVerified: true, ownerAcknowledged: true },
    appCheck: { reportDigest: observed.appCheckReport.evidenceSha256, nonInteractiveCallerInventoryAccepted: true, correlatedDenialUxAccepted: true },
    performance: { accepted: true, evidenceId: 'synthetic-performance-001', completedAt: stamp(0.5), targetOrigin: stage ? 'https://huddleway-crm-canary.web.app' : 'https://huddleway.com',
      authenticated: true, noCustomerPayloads: true, observationMode: 'authenticated-synthetic-canary', customerActivityClaimed: false,
      rum: { windowStartedAt: stamp(25), windowEndedAt: stamp(1), desktop: { samples: 75, lcpMs: 2500, inpMs: 200, cls: 0.1 }, mobile: { samples: 75, lcpMs: 2500, inpMs: 200, cls: 0.1 } },
      cdn: { assetSamples: 3, brotliVerified: true, gzipVerified: true, fingerprintedImmutableCacheVerified: true, warmCacheHitVerified: true },
      edge: { desktopP75Ms: 1000, mobileP75Ms: 1500, samplesPerClass: 20 },
      media: { fixtureObjects: 1, responsiveWidths: [320, 640, 1280], modernFormats: ['webp'], immutableCacheVerified: true, sourceDerivativeIsolationVerified: true } },
    governance: { mode: 'owner-authorized-independent-technical-review',
      ownerAuthorization: { actorId: 'synthetic-human-owner', actorType: 'human', scope: stage ? 'preproduction-validation' : 'production-publication', reference: 'synthetic-owner-message-001', evidenceDigest: observed.ownerAuthorizationDigest },
      implementer: { actorId: 'synthetic-agent-author', actorType: 'agent' },
      independentReview: { actorId: 'synthetic-agent-reviewer', actorType: 'agent', reference: 'synthetic-review-message-001', evidenceDigest: observed.technicalReviewDigest, subjectDigest: '' } },
    deploymentApproval: stage ? null : { approved: true, target: 'porkbun-huddleway-static', windowStartsAt: stamp(1), windowEndsAt: stamp(-1), rollbackReleaseId: 'synthetic-rollback-release-001', rollbackArtifactSha256: sha('rollback bundle'), approverIds: ['synthetic-human-owner'] },
  };
  const manifest = stage ? { schemaVersion: 1, mode: 'stage-canary', projectId: STAGE_CANARY.projectId, hostingSite: STAGE_CANARY.hostingSite,
    backendUrl: STAGE_CANARY.backendUrl, websiteCommit: release.websiteCommit, backendCommit: release.backendCommit }
    : { schemaVersion: 1, environment: { id: 'production-candidate', backendOrigin: 'https://api.huddleway.com' }, source: { commit: release.websiteCommit },
      backendContract: { commit: release.backendCommit }, artifact: { sha256: release.artifactSha256 } };
  const value = { evidence, manifest, observed, options: { phase, now, externalEvidenceSha256: sha('synthetic external file') } };
  return review(value);
}
function review(value: any) { value.evidence.governance.independentReview.subjectDigest = scopedReviewSubject(value.evidence, value.observed); return value; }
function accept(value: any) { return validateScopedExternalEvidence(value.evidence, value.manifest, value.observed, value.options); }
function rehashAppCheck(value: any) {
  const { evidenceSha256: _digest, ...body } = value.observed.appCheckReport;
  value.observed.appCheckReport.evidenceSha256 = acceptanceDigest(body); value.evidence.appCheck.reportDigest = value.observed.appCheckReport.evidenceSha256; return review(value);
}
describe('explicit iOS and portal external evidence', () => {
  it('accepts actual scoped stage evidence without fabricating Android or production authorization', () => {
    const input = fixture(); const receipt = accept(input);
    expect(receipt.status).toBe('preproduction_evidence_accepted'); expect(receipt.productionPromotionAuthorized).toBe(false); expect(receipt.androidValidated).toBe(false);
    expect(() => verifyScopedReceipt(receipt, input.evidence, input.manifest, input.observed, input.options)).not.toThrow();
    expect(() => verifyAcceptanceReceipt(receipt, input.manifest, input.options.externalEvidenceSha256)).toThrow();
    expect(() => validateExternalReleaseEvidence(input.evidence, input.manifest, input.options)).toThrow();
  });
  it('rejects source/artifact/phase substitutions and typed deployment approval in staging', () => {
    for (const change of [
      (x: any) => { x.manifest.websiteCommit = 'f'.repeat(40); },
      (x: any) => { x.evidence.release.artifactSha256 = sha('other artifact'); },
      (x: any) => { x.evidence.validationScope.projectId = 'sports-team-apps'; },
      (x: any) => { x.evidence.deploymentApproval = { approved: true }; },
      (x: any) => { x.options.phase = 'publication'; },
    ]) { const input = fixture(); change(input); expect(() => accept(review(input))).toThrow(); }
  });
  it('preserves exact performance thresholds and genuine non-production Firestore plus Storage recovery', () => {
    for (const change of [
      (x: any) => { x.evidence.performance.rum.desktop.samples = 74; },
      (x: any) => { x.evidence.performance.rum.mobile.inpMs = 201; },
      (x: any) => { x.evidence.performance.rum.windowStartedAt = stamp(24); },
      (x: any) => { x.evidence.performance.edge.samplesPerClass = 19; },
      (x: any) => { x.evidence.performance.targetOrigin = 'https://huddleway.com'; },
      (x: any) => { x.evidence.performance.media.responsiveWidths.pop(); },
      (x: any) => { x.evidence.backupRecovery.storage.sourceObjects = 0; },
      (x: any) => { x.evidence.backupRecovery.targetProjectId = 'sports-team-apps'; },
      (x: any) => { x.evidence.backupRecovery.completedAt = stamp(27); },
    ]) { const input = fixture(); change(input); expect(() => accept(review(input))).toThrow(); }
  });
  it('requires both exact iOS bundles/providers, web and an accepted real 24h monitoring window', () => {
    for (const change of [
      (x: any) => { x.observed.appCheckReport.apps[0].bundleId = 'com.sportsweb.sportswebApp.parity'; },
      (x: any) => { x.observed.appCheckReport.providers.pop(); },
      (x: any) => { x.observed.appCheckReport.decision.validRunsByConsumerClass.ios = 0; },
      (x: any) => { x.observed.appCheckReport.decision.consumerPolicy.waived = ['ios']; },
      (x: any) => { x.observed.appCheckReport.decision.monitoringAccepted = false; },
      (x: any) => { x.observed.appCheckReport.customBackend.verifiedRatio = 0.98; },
      (x: any) => { x.observed.appCheckReport.window.startedAt = stamp(24); },
      (x: any) => { x.observed.appCheckReport.generatedAt = stamp(25); },
    ]) { const input = fixture(); change(input); expect(() => accept(rehashAppCheck(input))).toThrow(); }
  });
  it('binds truthful owner and independent review to actual files and all declarations', () => {
    for (const change of [
      (x: any) => { x.evidence.governance.ownerAuthorization.actorType = 'agent'; },
      (x: any) => { x.evidence.governance.independentReview.actorId = x.evidence.governance.implementer.actorId; },
      (x: any) => { x.observed.ownerAuthorizationDigest = sha('different authority'); },
      (x: any) => { x.evidence.performance.rum.desktop.lcpMs = 2400; },
    ]) { const input = fixture(); change(input); expect(() => accept(input)).toThrow(); }
  });
  it('requires actual production evidence and a current owner window for publication', () => {
    expect(accept(fixture('publication')).status).toBe('publication_evidence_accepted');
    for (const change of [
      (x: any) => { x.observed.appCheckReport.customBackend.resourceType = 'cloud_run_revision'; },
      (x: any) => { x.evidence.deploymentApproval.windowStartsAt = stamp(-0.5); },
      (x: any) => { x.evidence.deploymentApproval.approverIds = ['somebody-else']; },
      (x: any) => { x.manifest.environment.backendOrigin = STAGE_CANARY.backendUrl; },
    ]) { const input = fixture('publication'); change(input); expect(() => accept(rehashAppCheck(input))).toThrow(); }
  });
  it('revalidates receipt evidence freshness rather than treating acceptance time as a renewal', () => {
    const input = fixture(); const receipt = accept(input);
    expect(() => verifyScopedReceipt(receipt, input.evidence, input.manifest, input.observed, { ...input.options, now: NOW + 27 * 3600000 })).toThrow();
    receipt.productionPromotionAuthorized = true;
    expect(() => verifyScopedReceipt(receipt, input.evidence, input.manifest, input.observed, input.options)).toThrow();
  });
  it('CLI reads actual hash-bound files, writes an exclusive private stage receipt and rejects it on the legacy path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'portal-scope-unit-'));
    try {
      const input = fixture('preproduction', Date.now());
      const files: Record<string, string> = {};
      for (const [key, contents] of Object.entries({ evidence: JSON.stringify(input.evidence), manifest: JSON.stringify(input.manifest),
        'artifact-report': JSON.stringify(input.observed.artifactReport), 'app-check-report': JSON.stringify(input.observed.appCheckReport),
        'owner-authorization': 'synthetic actual owner file', 'technical-review': 'synthetic actual review file' })) {
        files[key] = join(directory, `${key}.json`); writeFileSync(files[key], contents, { mode: 0o600 });
      }
      const common = Object.entries(files).flatMap(([key, file]) => [`--${key}`, file]);
      common.push('--expected-sha256', sha(readFileSync(files.evidence, 'utf8')));
      const script = 'scripts/release/crm-external-evidence.mjs'; const output = join(directory, 'receipt.json');
      const accepted = spawnSync(process.execPath, [script, 'accept-preproduction', ...common, '--out', output], { encoding: 'utf8' });
      expect(accepted.status, accepted.stderr).toBe(0); expect(statSync(output).mode & 0o777).toBe(0o600);
      expect(spawnSync(process.execPath, [script, 'accept-preproduction', ...common, '--out', output]).status).not.toBe(0);
      expect(spawnSync(process.execPath, [script, 'verify-preproduction', ...common, '--receipt', output]).status).toBe(0);
      expect(spawnSync(process.execPath, [script, 'verify', '--receipt', output, '--manifest', files.manifest, '--expected-sha256', common.at(-1)!]).status).not.toBe(0);
      writeFileSync(files.evidence, '{}');
      expect(spawnSync(process.execPath, [script, 'verify-preproduction', ...common, '--receipt', output]).status).not.toBe(0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
