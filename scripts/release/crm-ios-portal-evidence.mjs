import { createHash } from 'node:crypto';
import { readFile, lstat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { acceptanceDigest, assert, assertExactKeys, assertSha256, assertString, assertRecentPast, assertExactStringSet,
  validateReleaseBinding, validateBackupRecovery, validateMonitoring, validatePerformance, validateDeploymentApproval,
} from './crm-external-evidence.mjs';
import { STAGE_CANARY } from './crm-stage-canary-contract.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => acceptanceDigest(a) === acceptanceDigest(b);
const REQUIRED_APPS = { 'ios-consumer': 'com.sportsweb.sportswebApp', 'ios-admin': 'com.sportsweb.sportswebAdmin', web: null };
export function scopedContract(phase) {
  assert(['preproduction', 'publication'].includes(phase), 'Unknown scoped phase.');
  const stage = phase === 'preproduction';
  return { id: stage ? 'ios-portal-v1' : 'ios-portal-publication-v1', version: 1, phase,
    projectId: stage ? 'huddleway-dev' : 'sports-team-apps', approvedSurfaces: ['ios', 'web'],
    iosAudiences: ['consumer', 'admin'], androidValidated: false, productionPromotionAuthorized: false };
}
function validateScope(value, phase) {
  const required = scopedContract(phase);
  assert(value?.id === required.id && value.version === 1 && value.phase === phase && value.projectId === required.projectId,
    'Explicit phase/project scope is required; stage evidence cannot become publication evidence.');
  return required;
}
function checkedArtifact(report, scope, release) {
  const { artifactManifestDigest, generatedAt: _at, ...body } = report || {};
  assert(artifactManifestDigest === digest(JSON.stringify(body)), 'Actual artifact report checksum is invalid.');
  assert(report.schemaVersion === (scope.phase === 'preproduction' ? 2 : 3) && report.verdict === 'ready' && report.counts?.issueCount === 0,
    'A ready artifact report for the exact scoped phase is required.');
  validateScope(report.validationScope, scope.phase);
  assert(report.releaseId === release.releaseId && report.sourceManifests?.crm_web?.candidateSha === release.websiteCommit
    && report.sourceManifests?.app_backend?.candidateSha === release.backendCommit, 'Artifact inventory source/release differs.');
  const bundle = report.localArtifacts?.find((entry) => entry.key === 'crm_web_bundle');
  assert(bundle?.exists === true && bundle.actualSha256 === release.artifactSha256 && bundle.expectedSha256 === release.artifactSha256,
    'Actual CRM artifact hash differs from the external evidence.');
  return artifactManifestDigest;
}
function checkedRelease(release, manifest, scope, report) {
  assertExactKeys(release, ['artifactSha256', 'backendCommit', 'environment', 'releaseId', 'websiteCommit'], 'release');
  if (scope.phase === 'preproduction') {
    assert(release.environment === 'stage-canary' && manifest?.schemaVersion === 1 && manifest.mode === 'stage-canary'
      && manifest.projectId === STAGE_CANARY.projectId && manifest.hostingSite === STAGE_CANARY.hostingSite
      && manifest.backendUrl === STAGE_CANARY.backendUrl && manifest.websiteCommit === release.websiteCommit
      && manifest.backendCommit === release.backendCommit, 'Stage canary manifest must identify the actual exact stage sources and target.');
    for (const key of ['websiteCommit', 'backendCommit']) assert(/^[a-f0-9]{40}$/.test(release[key]), 'Exact source commits are required.');
    assertString(release.releaseId, 'release ID'); assertSha256(release.artifactSha256, 'artifact hash');
  } else {
    validateReleaseBinding(release, manifest);
    assert(release.environment === 'production-candidate' && manifest.environment?.backendOrigin === 'https://api.huddleway.com',
      'Publication needs an actual production manifest and canonical API.');
  }
  return checkedArtifact(report, scope, release);
}
function checkedAppCheck(report, scope, now) {
  const { evidenceSha256, ...body } = report || {};
  assert(evidenceSha256 === acceptanceDigest(body), 'App Check evidence checksum is invalid.');
  assert(report.schemaVersion === 3 && report.evidenceType === 'firebase-app-check-monitor' && report.project?.projectId === scope.projectId,
    'App Check evidence must be the actual scoped project report.');
  validateScope(report.validationScope, scope.phase);
  assertRecentPast(report.generatedAt, 'App Check report time', now, 24 * 60 * 60 * 1000);
  const start = Date.parse(report.window?.startedAt); const end = Date.parse(report.window?.endedAt);
  assert(Number.isFinite(start) && Number.isFinite(end) && end <= now && end - start >= 24 * 60 * 60 * 1000,
    'App Check needs an actual observation window of at least 24 hours.');
  const policy = report.decision?.consumerPolicy;
  assertExactStringSet(policy?.required, ['ios', 'web'], 'App Check required consumers');
  assertExactStringSet(policy?.excluded, ['android'], 'App Check scope exclusions');
  assert(Array.isArray(policy?.waived) && policy.waived.length === 0 && !policy.waiverReference, 'Required scoped consumers cannot be waived.');
  const apps = report.apps?.filter((entry) => entry.excluded !== true) || [];
  assertExactStringSet(apps.map((entry) => entry.label), Object.keys(REQUIRED_APPS), 'App Check app inventory');
  for (const app of apps) {
    if (app.label !== 'web') assert(app.bundleId === REQUIRED_APPS[app.label], 'iOS App Check bundle identity differs.');
    const providers = app.label === 'web' ? ['recaptcha-enterprise'] : ['app-attest', 'device-check'];
    for (const provider of providers) assert(report.providers?.some((entry) => entry.app === app.label && entry.provider === provider && entry.configured === true),
      'Each required native/web provider must actually be configured.');
  }
  const decision = report.decision;
  assert(decision.monitoringAccepted === true && decision.providerRegistrationComplete === true && decision.monitorOnly === true
    && decision.monitorConfigurationPrecedesWindow === true && decision.customBackendTelemetryCovered === true
    && decision.customBackendMonitoringAccepted === true && decision.verifiedRatio >= 0.99 && decision.unidentifiedValidRequests === 0
    && ['ios', 'web'].every((key) => decision.validRunsByConsumerClass?.[key] >= 2), 'Complete accepted scoped App Check monitoring is required.');
  const backend = report.customBackend;
  assert(backend?.telemetryCovered === true && backend.monitoringAccepted === true && backend.verifiedRatio >= 0.99
    && backend.unidentifiedValidRequests === 0 && ['ios', 'web'].every((key) => backend.validRunsByConsumerClass?.[key] >= 2),
    'Actual custom backend coverage and verified traffic must satisfy the same thresholds.');
  assert(backend.resourceType === (scope.phase === 'preproduction' ? 'cloud_run_revision' : 'render_service'),
    'Staged Cloud Run telemetry cannot certify the production Render service.');
  return { evidenceSha256, projectId: scope.projectId, window: report.window, requiredApps: Object.keys(REQUIRED_APPS), monitoringAccepted: true };
}
export function scopedReviewSubject(evidence, observed) {
  const { evidenceDigest: _file, subjectDigest: _subject, ...identity } = evidence.governance.independentReview;
  return acceptanceDigest({ evidence: { ...evidence, governance: { ...evidence.governance, independentReview: identity } },
    artifactReportDigest: observed.artifactReport.artifactManifestDigest, appCheckReportDigest: observed.appCheckReport.evidenceSha256,
    ownerAuthorizationDigest: observed.ownerAuthorizationDigest });
}
function checkedGovernance(evidence, observed, scope, now) {
  const governance = evidence.governance;
  assertExactKeys(governance, ['mode', 'ownerAuthorization', 'implementer', 'independentReview'], 'scoped governance');
  assert(governance.mode === 'owner-authorized-independent-technical-review', 'Truthful owner and independent review governance required.');
  const owner = governance.ownerAuthorization; const author = governance.implementer; const reviewer = governance.independentReview;
  assertExactKeys(owner, ['actorId', 'actorType', 'scope', 'reference', 'evidenceDigest'], 'owner authorization');
  assertExactKeys(author, ['actorId', 'actorType'], 'implementer');
  assertExactKeys(reviewer, ['actorId', 'actorType', 'reference', 'evidenceDigest', 'subjectDigest'], 'independent review');
  assert(owner.actorType === 'human' && owner.scope === (scope.phase === 'preproduction' ? 'preproduction-validation' : 'production-publication'),
    'Actual human authorization must cover this phase.');
  for (const entry of [owner, author, reviewer]) { assertString(entry.actorId, 'actor identity'); assert(['human', 'agent'].includes(entry.actorType), 'Actor type must be truthful.'); }
  assert(author.actorId !== reviewer.actorId && owner.reference !== reviewer.reference, 'Independent author/reviewer and authority references required.');
  assertString(owner.reference, 'owner reference'); assertString(reviewer.reference, 'review reference');
  assert(owner.evidenceDigest === assertSha256(observed.ownerAuthorizationDigest, 'actual owner file hash')
    && reviewer.evidenceDigest === assertSha256(observed.technicalReviewDigest, 'actual review file hash'), 'Actual authorization/review file hashes differ.');
  assert(reviewer.subjectDigest === scopedReviewSubject(evidence, observed), 'Independent review does not bind this exact packet.');
  if (scope.phase === 'publication') {
    const approval = validateDeploymentApproval(evidence.deploymentApproval, now);
    assert(Date.parse(approval.windowStartsAt) <= now && approval.approverIds.includes(owner.actorId), 'Publication requires the actual owner and an already-active window.');
  } else assert(evidence.deploymentApproval === null, 'Preproduction acceptance cannot claim deployment approval.');
  return governance;
}
export function validateScopedExternalEvidence(evidence, manifest, observed, { phase, now = Date.now(), externalEvidenceSha256 } = {}) {
  assertExactKeys(evidence, ['schemaVersion', 'validationScope', 'release', 'backupRecovery', 'monitoring', 'performance', 'appCheck', 'governance', 'deploymentApproval'], 'scoped external evidence');
  assert(evidence.schemaVersion === 2, 'Scoped external evidence requires schema2.');
  const scope = validateScope(evidence.validationScope, phase);
  const artifactDigest = checkedRelease(evidence.release, manifest, scope, observed.artifactReport);
  assertExactKeys(evidence.appCheck, ['reportDigest', 'nonInteractiveCallerInventoryAccepted', 'correlatedDenialUxAccepted'], 'scoped App Check declaration');
  assert(evidence.appCheck.reportDigest === observed.appCheckReport.evidenceSha256 && evidence.appCheck.nonInteractiveCallerInventoryAccepted === true
    && evidence.appCheck.correlatedDenialUxAccepted === true, 'Actual App Check report and caller/denial acceptance are required.');
  const appCheck = checkedAppCheck(observed.appCheckReport, scope, now);
  const performance = validatePerformance(evidence.performance, now);
  const origins = phase === 'preproduction' ? ['https://huddleway-crm-canary.web.app'] : ['https://huddleway.com'];
  assert(origins.includes(performance.targetOrigin), 'Performance evidence must observe the actual scoped portal origin.');
  const gates = { backupRecovery: validateBackupRecovery(evidence.backupRecovery, now), monitoring: validateMonitoring(evidence.monitoring, now),
    performance, appCheck, governance: checkedGovernance(evidence, observed, scope, now) };
  const body = { schemaVersion: 2, validationScope: scope, status: phase === 'preproduction' ? 'preproduction_evidence_accepted' : 'publication_evidence_accepted',
    productionPromotionAuthorized: false, androidValidated: false, acceptedAt: new Date(now).toISOString(), release: evidence.release,
    externalEvidenceSha256: assertSha256(externalEvidenceSha256, 'actual external evidence hash'), artifactReportDigest: artifactDigest, gates };
  return { ...body, acceptanceSha256: acceptanceDigest(body) };
}
export function verifyScopedReceipt(receipt, evidence, manifest, observed, options) {
  const regenerated = validateScopedExternalEvidence(evidence, manifest, observed, options);
  assertRecentPast(receipt.acceptedAt, 'Scoped acceptance time', options.now ?? Date.now(), 7 * 24 * 60 * 60 * 1000);
  const { acceptanceSha256, ...body } = receipt;
  assert(acceptanceSha256 === acceptanceDigest(body), 'Scoped receipt checksum is invalid.');
  // Revalidate current freshness and authority; acceptance time alone is not a renewal.
  const { acceptedAt: _previous, acceptanceSha256: _old, ...prior } = receipt;
  const { acceptedAt: _current, acceptanceSha256: _new, ...current } = regenerated;
  assert(same(prior, current), 'Scoped receipt differs from the actual current evidence packet.');
  return receipt;
}
async function readJson(file, label) {
  assert(typeof file === 'string' && file, `${label} path required.`);
  const name = resolve(file); const stat = await lstat(name);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 5 * 1024 * 1024, `${label} must be a bounded regular file.`);
  const bytes = await readFile(name); return { value: JSON.parse(bytes), digest: digest(bytes), name };
}
export async function scopedMain(command, options) {
  if (command === 'scoped-contract') {
    assertExactKeys(options, ['phase'], 'contract options');
    console.log(JSON.stringify({ contractOnly: true, ...scopedContract(options.phase), requiredEvidence: ['exact source/artifact inventory', 'encrypted Firestore+Storage recovery', 'monitoring alerts', '24h App Check', '24h authenticated synthetic performance', 'real owner authority', 'independent technical review'] }, null, 2)); return;
  }
  const accepting = command.startsWith('accept-'); const phase = command.endsWith('-preproduction') ? 'preproduction' : 'publication';
  assertExactKeys(options, ['evidence', 'manifest', 'artifact-report', 'app-check-report', 'owner-authorization', 'technical-review', 'expected-sha256', accepting ? 'out' : 'receipt'], 'scoped command options');
  const source = await readJson(options.evidence, 'External evidence'); const manifest = await readJson(options.manifest, 'Manifest');
  assert(source.digest === assertSha256(options['expected-sha256'], 'approved external evidence hash'), 'External evidence changed after approval.');
  const artifact = await readJson(options['artifact-report'], 'Artifact report'); const appCheck = await readJson(options['app-check-report'], 'App Check report');
  const authorityFiles = await Promise.all(['owner-authorization', 'technical-review'].map(async (key) => {
    const name = resolve(options[key]); const stat = await lstat(name);
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1024 * 1024, 'Authority evidence must be a bounded regular file.');
    return digest(await readFile(name));
  }));
  const observed = { artifactReport: artifact.value, appCheckReport: appCheck.value, ownerAuthorizationDigest: authorityFiles[0], technicalReviewDigest: authorityFiles[1] };
  const validation = { phase, externalEvidenceSha256: source.digest };
  if (!accepting) {
    const receipt = await readJson(options.receipt, 'Scoped receipt');
    verifyScopedReceipt(receipt.value, source.value, manifest.value, observed, validation);
    console.log(`Scoped ${phase} evidence verified: ${receipt.value.acceptanceSha256}`); return;
  }
  const receipt = validateScopedExternalEvidence(source.value, manifest.value, observed, validation);
  const output = resolve(options.out);
  assert(!Object.entries(options).some(([key, value]) => key !== 'out' && key !== 'expected-sha256' && resolve(value) === output), 'Output cannot overwrite input evidence.');
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(`Scoped ${phase} evidence accepted: ${receipt.acceptanceSha256}; production authorization: false`);
}
