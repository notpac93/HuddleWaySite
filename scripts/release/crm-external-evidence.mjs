#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const PRODUCTION_PROJECT_ID = 'sports-team-apps';
const ACCEPTED_TARGET = 'porkbun-huddleway-static';
const APPROVED_NONPRODUCTION_RECOVERY_PROJECTS = Object.freeze([
  'huddleway-dev',
]);
const REQUIRED_MONITORING_QUERIES = Object.freeze([
  'backup-freshness',
  'cross-tenant-denial-regression',
  'migration-failure',
  'webhook-failure-rate',
  'webhook-reconciliation-backlog',
]);
const REQUIRED_ALERT_RECEIPTS = Object.freeze([
  'backend-health',
  'backup-freshness',
  'webhook-failure-rate',
  'webhook-reconciliation-backlog',
]);
const APPROVED_RELEASE_SURFACES = Object.freeze([
  'android',
  'web',
]);
const REQUIRED_APP_CHECK_PROVIDERS = Object.freeze({
  android: 'play-integrity',
  web: 'recaptcha-enterprise',
});
const GOOD_CWV_LIMITS = Object.freeze({
  lcpMs: 2500,
  inpMs: 200,
  cls: 0.1,
});

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isPlainObject(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype,
  );
}

function assertObject(value, label) {
  assert(isPlainObject(value), `${label} must be a JSON object.`);
  return value;
}

function assertExactKeys(value, keys, label) {
  const actual = Object.keys(assertObject(value, label)).sort();
  const expected = [...keys].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} must contain exactly: ${expected.join(', ')}.`,
  );
}

function assertBoolean(value, label, expected = undefined) {
  assert(typeof value === 'boolean', `${label} must be a boolean.`);
  if (expected !== undefined) {
    assert(value === expected, `${label} must be ${expected}.`);
  }
  return value;
}

function assertString(value, label, pattern = SAFE_ID) {
  assert(typeof value === 'string' && pattern.test(value), `${label} is invalid.`);
  return value;
}

function assertSha256(value, label) {
  return assertString(String(value || '').toLowerCase(), label, SHA256);
}

function assertCommit(value, label) {
  return assertString(String(value || '').toLowerCase(), label, COMMIT_SHA);
}

function assertInteger(value, label, minimum = 0) {
  assert(
    Number.isSafeInteger(value) && value >= minimum,
    `${label} must be an integer greater than or equal to ${minimum}.`,
  );
  return value;
}

function assertNumber(value, label, minimum = 0, maximum = Infinity) {
  assert(
    Number.isFinite(value) && value >= minimum && value <= maximum,
    `${label} must be between ${minimum} and ${maximum}.`,
  );
  return value;
}

function parseTimestamp(value, label) {
  assert(typeof value === 'string', `${label} must be an ISO-8601 timestamp.`);
  const milliseconds = Date.parse(value);
  assert(Number.isFinite(milliseconds), `${label} must be an ISO-8601 timestamp.`);
  assert(
    new Date(milliseconds).toISOString() === value,
    `${label} must use normalized UTC ISO-8601 form.`,
  );
  return milliseconds;
}

function assertRecentPast(value, label, now, maximumAgeMs) {
  const timestamp = parseTimestamp(value, label);
  assert(timestamp <= now, `${label} cannot be in the future.`);
  assert(now - timestamp <= maximumAgeMs, `${label} is too old for release acceptance.`);
  return timestamp;
}

function assertUniqueSafeIds(values, label, minimumLength = 1) {
  assert(Array.isArray(values), `${label} must be an array.`);
  assert(values.length >= minimumLength, `${label} needs at least ${minimumLength} entries.`);
  const normalized = values.map((value, index) =>
    assertString(value, `${label}[${index}]`));
  assert(new Set(normalized).size === normalized.length, `${label} must be unique.`);
  return normalized;
}

function assertUniqueStrings(
  values,
  label,
  pattern = /^[a-z][a-z0-9-]{1,63}$/,
  minimumLength = 1,
) {
  assert(Array.isArray(values), `${label} must be an array.`);
  assert(values.length >= minimumLength, `${label} needs at least ${minimumLength} entries.`);
  const normalized = values.map((value, index) =>
    assertString(value, `${label}[${index}]`, pattern));
  assert(new Set(normalized).size === normalized.length, `${label} must be unique.`);
  return normalized;
}

function assertExactStringSet(values, expected, label) {
  const actual = assertUniqueStrings(values, label).sort();
  const sortedExpected = [...expected].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(sortedExpected),
    `${label} must contain exactly: ${sortedExpected.join(', ')}.`,
  );
  return actual;
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function acceptanceDigest(value) {
  return sha256(canonicalJson(value));
}

function validateReleaseBinding(release, manifest) {
  assertExactKeys(
    release,
    [
      'artifactSha256',
      'backendCommit',
      'environment',
      'releaseId',
      'websiteCommit',
    ],
    'release',
  );
  const binding = {
    releaseId: assertString(release.releaseId, 'release.releaseId'),
    environment: assertString(release.environment, 'release.environment'),
    websiteCommit: assertCommit(release.websiteCommit, 'release.websiteCommit'),
    backendCommit: assertCommit(release.backendCommit, 'release.backendCommit'),
    artifactSha256: assertSha256(
      release.artifactSha256,
      'release.artifactSha256',
    ),
  };
  assert(manifest?.schemaVersion === 1, 'Release manifest schema must be 1.');
  assert(
    binding.environment === manifest.environment?.id,
    'External evidence environment does not match the release manifest.',
  );
  assert(
    binding.websiteCommit === String(manifest.source?.commit || '').toLowerCase(),
    'External evidence website commit does not match the release manifest.',
  );
  assert(
    binding.backendCommit
      === String(manifest.backendContract?.commit || '').toLowerCase(),
    'External evidence backend commit does not match the release manifest.',
  );
  assert(
    binding.artifactSha256
      === String(manifest.artifact?.sha256 || '').toLowerCase(),
    'External evidence artifact does not match the release manifest.',
  );
  return binding;
}

function validateBackupRecovery(value, now) {
  assertExactKeys(
    value,
    [
      'accepted',
      'bundleSha256',
      'completedAt',
      'encryptedArtifactSha256',
      'evidenceId',
      'firestore',
      'operatorApprovals',
      'rpoHours',
      'rtoMinutes',
      'storage',
      'targetProjectId',
    ],
    'backupRecovery',
  );
  assertBoolean(value.accepted, 'backupRecovery.accepted', true);
  assertRecentPast(
    value.completedAt,
    'backupRecovery.completedAt',
    now,
    26 * 60 * 60 * 1000,
  );
  const targetProjectId = assertString(
    value.targetProjectId,
    'backupRecovery.targetProjectId',
    /^[a-z0-9][a-z0-9-]{4,62}$/,
  );
  assert(
    targetProjectId !== PRODUCTION_PROJECT_ID,
    'Recovery rehearsal must not target the production Firebase project.',
  );
  assert(
    APPROVED_NONPRODUCTION_RECOVERY_PROJECTS.includes(targetProjectId)
      || /(stage|staging|uat|qa|recovery|drill|nonprod)/i.test(targetProjectId),
    'Recovery target must be an explicitly named non-production project.',
  );

  assertExactKeys(
    value.firestore,
    [
      'restoredDocuments',
      'rollbackRemainingDocuments',
      'sourceDocuments',
      'verifiedDocuments',
    ],
    'backupRecovery.firestore',
  );
  const sourceDocuments = assertInteger(
    value.firestore.sourceDocuments,
    'backupRecovery.firestore.sourceDocuments',
    1,
  );
  assert(
    assertInteger(
      value.firestore.restoredDocuments,
      'backupRecovery.firestore.restoredDocuments',
      1,
    ) === sourceDocuments,
    'Firestore restore count must equal the source count.',
  );
  assert(
    assertInteger(
      value.firestore.verifiedDocuments,
      'backupRecovery.firestore.verifiedDocuments',
      1,
    ) === sourceDocuments,
    'Firestore readback count must equal the source count.',
  );
  assert(
    assertInteger(
      value.firestore.rollbackRemainingDocuments,
      'backupRecovery.firestore.rollbackRemainingDocuments',
    ) === 0,
    'Firestore rollback must leave zero rehearsal documents.',
  );

  assertExactKeys(
    value.storage,
    [
      'restoredObjects',
      'rollbackRemainingObjects',
      'sourceBytes',
      'sourceObjects',
      'verifiedObjects',
    ],
    'backupRecovery.storage',
  );
  const sourceObjects = assertInteger(
    value.storage.sourceObjects,
    'backupRecovery.storage.sourceObjects',
    1,
  );
  const sourceBytes = assertInteger(
    value.storage.sourceBytes,
    'backupRecovery.storage.sourceBytes',
    1,
  );
  assert(
    assertInteger(
      value.storage.restoredObjects,
      'backupRecovery.storage.restoredObjects',
      1,
    ) === sourceObjects,
    'Storage restore count must equal the source count.',
  );
  assert(
    assertInteger(
      value.storage.verifiedObjects,
      'backupRecovery.storage.verifiedObjects',
      1,
    ) === sourceObjects,
    'Storage readback count must equal the source count.',
  );
  assert(
    assertInteger(
      value.storage.rollbackRemainingObjects,
      'backupRecovery.storage.rollbackRemainingObjects',
    ) === 0,
    'Storage rollback must leave zero rehearsal objects.',
  );
  assertNumber(value.rtoMinutes, 'backupRecovery.rtoMinutes', 0, 240);
  assertNumber(value.rpoHours, 'backupRecovery.rpoHours', 0, 24);
  const operatorApprovals = assertUniqueSafeIds(
    value.operatorApprovals,
    'backupRecovery.operatorApprovals',
    1,
  );
  return {
    evidenceId: assertString(value.evidenceId, 'backupRecovery.evidenceId'),
    completedAt: value.completedAt,
    encryptedArtifactSha256: assertSha256(
      value.encryptedArtifactSha256,
      'backupRecovery.encryptedArtifactSha256',
    ),
    bundleSha256: assertSha256(
      value.bundleSha256,
      'backupRecovery.bundleSha256',
    ),
    targetProjectId,
    firestoreDocuments: sourceDocuments,
    storageObjects: sourceObjects,
    storageBytes: sourceBytes,
    operatorApprovals,
  };
}

function validateMonitoring(value, now) {
  assertExactKeys(
    value,
    [
      'accepted',
      'alertReceipts',
      'completedAt',
      'correlationLookupVerified',
      'evidenceId',
      'ownerAcknowledged',
      'provider',
      'savedQueries',
    ],
    'monitoring',
  );
  assertBoolean(value.accepted, 'monitoring.accepted', true);
  assertRecentPast(
    value.completedAt,
    'monitoring.completedAt',
    now,
    30 * 24 * 60 * 60 * 1000,
  );
  assertExactStringSet(
    value.savedQueries,
    REQUIRED_MONITORING_QUERIES,
    'monitoring.savedQueries',
  );
  assertExactStringSet(
    value.alertReceipts,
    REQUIRED_ALERT_RECEIPTS,
    'monitoring.alertReceipts',
  );
  assertBoolean(
    value.correlationLookupVerified,
    'monitoring.correlationLookupVerified',
    true,
  );
  assertBoolean(value.ownerAcknowledged, 'monitoring.ownerAcknowledged', true);
  return {
    evidenceId: assertString(value.evidenceId, 'monitoring.evidenceId'),
    completedAt: value.completedAt,
    provider: assertString(value.provider, 'monitoring.provider'),
  };
}

function validateAppCheck(value, now, requiredConsumers) {
  assertExactKeys(
    value,
    [
      'accepted',
      'completedAt',
      'correlatedDenialUxAccepted',
      'enforcementApproved',
      'enforcementEnabled',
      'evidenceId',
      'mode',
      'monitoringHours',
      'nonInteractiveCallerInventoryAccepted',
      'providers',
    ],
    'appCheck',
  );
  assertBoolean(value.accepted, 'appCheck.accepted', true);
  assertRecentPast(
    value.completedAt,
    'appCheck.completedAt',
    now,
    7 * 24 * 60 * 60 * 1000,
  );
  assert(
    value.mode === 'monitor' || value.mode === 'enforce',
    'appCheck.mode must be monitor or enforce.',
  );
  assertNumber(value.monitoringHours, 'appCheck.monitoringHours', 24);
  assertBoolean(
    value.nonInteractiveCallerInventoryAccepted,
    'appCheck.nonInteractiveCallerInventoryAccepted',
    true,
  );
  assertBoolean(
    value.correlatedDenialUxAccepted,
    'appCheck.correlatedDenialUxAccepted',
    true,
  );
  const enforcementApproved = assertBoolean(
    value.enforcementApproved,
    'appCheck.enforcementApproved',
  );
  const enforcementEnabled = assertBoolean(
    value.enforcementEnabled,
    'appCheck.enforcementEnabled',
  );
  if (value.mode === 'monitor') {
    assert(!enforcementEnabled, 'Monitor mode cannot claim enforcement is enabled.');
  } else {
    assert(
      enforcementApproved && enforcementEnabled,
      'Enforce mode requires explicit approval and enabled enforcement.',
    );
  }
  assert(Array.isArray(value.providers), 'appCheck.providers must be an array.');
  const consumers = [];
  const providers = value.providers.map((entry, index) => {
    const label = `appCheck.providers[${index}]`;
    assertExactKeys(
      entry,
      ['consumer', 'evidenceId', 'provider', 'successfulRuns'],
      label,
    );
    const consumer = assertString(
      entry.consumer,
      `${label}.consumer`,
      /^[a-z][a-z0-9-]{1,63}$/,
    );
    assert(
      REQUIRED_APP_CHECK_PROVIDERS[consumer]
        && entry.provider === REQUIRED_APP_CHECK_PROVIDERS[consumer],
      `${label}.provider is not the approved provider for ${consumer}.`,
    );
    consumers.push(consumer);
    return {
      consumer,
      provider: assertString(entry.provider, `${label}.provider`),
      evidenceId: assertString(entry.evidenceId, `${label}.evidenceId`),
      successfulRuns: assertInteger(
        entry.successfulRuns,
        `${label}.successfulRuns`,
        2,
      ),
    };
  });
  assertExactStringSet(
    consumers,
    requiredConsumers,
    'appCheck provider consumers',
  );
  return {
    evidenceId: assertString(value.evidenceId, 'appCheck.evidenceId'),
    completedAt: value.completedAt,
    mode: value.mode,
    monitoringHours: value.monitoringHours,
    enforcementApproved,
    enforcementEnabled,
    providers,
  };
}

function validateRumClass(value, label) {
  assertExactKeys(value, ['cls', 'inpMs', 'lcpMs', 'samples'], label);
  return {
    samples: assertInteger(value.samples, `${label}.samples`, 75),
    lcpMs: assertNumber(
      value.lcpMs,
      `${label}.lcpMs`,
      0,
      GOOD_CWV_LIMITS.lcpMs,
    ),
    inpMs: assertNumber(
      value.inpMs,
      `${label}.inpMs`,
      0,
      GOOD_CWV_LIMITS.inpMs,
    ),
    cls: assertNumber(value.cls, `${label}.cls`, 0, GOOD_CWV_LIMITS.cls),
  };
}

function validatePerformance(value, now) {
  assertExactKeys(
    value,
    [
      'accepted',
      'authenticated',
      'cdn',
      'completedAt',
      'customerActivityClaimed',
      'edge',
      'evidenceId',
      'media',
      'noCustomerPayloads',
      'observationMode',
      'rum',
      'targetOrigin',
    ],
    'performance',
  );
  assertBoolean(value.accepted, 'performance.accepted', true);
  assertBoolean(value.authenticated, 'performance.authenticated', true);
  assert(
    value.observationMode === 'authenticated-synthetic-canary',
    'performance.observationMode must be authenticated-synthetic-canary.',
  );
  assertBoolean(
    value.customerActivityClaimed,
    'performance.customerActivityClaimed',
    false,
  );
  assertBoolean(
    value.noCustomerPayloads,
    'performance.noCustomerPayloads',
    true,
  );
  assertRecentPast(
    value.completedAt,
    'performance.completedAt',
    now,
    7 * 24 * 60 * 60 * 1000,
  );
  const targetOrigin = new URL(value.targetOrigin);
  assert(
    targetOrigin.protocol === 'https:'
      && targetOrigin.origin === value.targetOrigin
      && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(
        targetOrigin.hostname,
      ),
    'performance.targetOrigin must be a non-loopback HTTPS origin.',
  );

  assertExactKeys(
    value.rum,
    ['desktop', 'mobile', 'windowEndedAt', 'windowStartedAt'],
    'performance.rum',
  );
  const windowStartedAt = parseTimestamp(
    value.rum.windowStartedAt,
    'performance.rum.windowStartedAt',
  );
  const windowEndedAt = assertRecentPast(
    value.rum.windowEndedAt,
    'performance.rum.windowEndedAt',
    now,
    7 * 24 * 60 * 60 * 1000,
  );
  assert(
    windowEndedAt - windowStartedAt >= 24 * 60 * 60 * 1000,
    'Field RUM window must cover at least 24 hours.',
  );
  assert(
    windowEndedAt >= windowStartedAt,
    'Field RUM window end must follow its start.',
  );
  const rum = {
    windowStartedAt: value.rum.windowStartedAt,
    windowEndedAt: value.rum.windowEndedAt,
    desktop: validateRumClass(value.rum.desktop, 'performance.rum.desktop'),
    mobile: validateRumClass(value.rum.mobile, 'performance.rum.mobile'),
  };

  assertExactKeys(
    value.cdn,
    [
      'assetSamples',
      'brotliVerified',
      'fingerprintedImmutableCacheVerified',
      'gzipVerified',
      'warmCacheHitVerified',
    ],
    'performance.cdn',
  );
  const cdn = {
    assetSamples: assertInteger(
      value.cdn.assetSamples,
      'performance.cdn.assetSamples',
      3,
    ),
    brotliVerified: assertBoolean(
      value.cdn.brotliVerified,
      'performance.cdn.brotliVerified',
      true,
    ),
    gzipVerified: assertBoolean(
      value.cdn.gzipVerified,
      'performance.cdn.gzipVerified',
      true,
    ),
    fingerprintedImmutableCacheVerified: assertBoolean(
      value.cdn.fingerprintedImmutableCacheVerified,
      'performance.cdn.fingerprintedImmutableCacheVerified',
      true,
    ),
    warmCacheHitVerified: assertBoolean(
      value.cdn.warmCacheHitVerified,
      'performance.cdn.warmCacheHitVerified',
      true,
    ),
  };

  assertExactKeys(
    value.edge,
    ['desktopP75Ms', 'mobileP75Ms', 'samplesPerClass'],
    'performance.edge',
  );
  const edge = {
    samplesPerClass: assertInteger(
      value.edge.samplesPerClass,
      'performance.edge.samplesPerClass',
      20,
    ),
    desktopP75Ms: assertNumber(
      value.edge.desktopP75Ms,
      'performance.edge.desktopP75Ms',
      0,
      1000,
    ),
    mobileP75Ms: assertNumber(
      value.edge.mobileP75Ms,
      'performance.edge.mobileP75Ms',
      0,
      1500,
    ),
  };

  assertExactKeys(
    value.media,
    [
      'fixtureObjects',
      'immutableCacheVerified',
      'modernFormats',
      'responsiveWidths',
      'sourceDerivativeIsolationVerified',
    ],
    'performance.media',
  );
  const responsiveWidths = value.media.responsiveWidths;
  assert(
    Array.isArray(responsiveWidths)
      && responsiveWidths.length >= 3
      && responsiveWidths.every(
        (width) => Number.isSafeInteger(width) && width >= 128 && width <= 4096,
      )
      && new Set(responsiveWidths).size === responsiveWidths.length,
    'performance.media.responsiveWidths needs at least three unique safe widths.',
  );
  const modernFormats = assertUniqueStrings(
    value.media.modernFormats,
    'performance.media.modernFormats',
  );
  assert(
    modernFormats.some((format) => ['avif', 'webp'].includes(format)),
    'Media evidence must include AVIF or WebP output.',
  );
  const media = {
    fixtureObjects: assertInteger(
      value.media.fixtureObjects,
      'performance.media.fixtureObjects',
      1,
    ),
    responsiveWidths,
    modernFormats,
    immutableCacheVerified: assertBoolean(
      value.media.immutableCacheVerified,
      'performance.media.immutableCacheVerified',
      true,
    ),
    sourceDerivativeIsolationVerified: assertBoolean(
      value.media.sourceDerivativeIsolationVerified,
      'performance.media.sourceDerivativeIsolationVerified',
      true,
    ),
  };

  return {
    evidenceId: assertString(value.evidenceId, 'performance.evidenceId'),
    completedAt: value.completedAt,
    targetOrigin: value.targetOrigin,
    observationMode: value.observationMode,
    customerActivityClaimed: false,
    rum,
    cdn,
    edge,
    media,
  };
}

function validateReleaseGovernance(value) {
  assertExactKeys(
    value,
    [
      'automatedValidationRequired',
      'mode',
      'ownerId',
      'approvedSurfaces',
      'productionConfirmationRequired',
    ],
    'releaseGovernance',
  );
  assert(
    value.mode === 'single-developer',
    'releaseGovernance.mode must be single-developer.',
  );
  assertBoolean(
    value.automatedValidationRequired,
    'releaseGovernance.automatedValidationRequired',
    true,
  );
  assertBoolean(
    value.productionConfirmationRequired,
    'releaseGovernance.productionConfirmationRequired',
    true,
  );
  assertExactStringSet(
    value.approvedSurfaces,
    APPROVED_RELEASE_SURFACES,
    'releaseGovernance.approvedSurfaces',
  );
  return {
    mode: value.mode,
    ownerId: assertString(value.ownerId, 'releaseGovernance.ownerId'),
    approvedSurfaces: [...value.approvedSurfaces].sort(),
    automatedValidationRequired: true,
    productionConfirmationRequired: true,
  };
}

function validateDeploymentApproval(value, now) {
  assertExactKeys(
    value,
    [
      'approved',
      'approverIds',
      'rollbackArtifactSha256',
      'rollbackReleaseId',
      'target',
      'windowEndsAt',
      'windowStartsAt',
    ],
    'deploymentApproval',
  );
  assertBoolean(value.approved, 'deploymentApproval.approved', true);
  assert(
    value.target === ACCEPTED_TARGET,
    `deploymentApproval.target must be ${ACCEPTED_TARGET}.`,
  );
  const windowStartsAt = parseTimestamp(
    value.windowStartsAt,
    'deploymentApproval.windowStartsAt',
  );
  const windowEndsAt = parseTimestamp(
    value.windowEndsAt,
    'deploymentApproval.windowEndsAt',
  );
  assert(windowEndsAt > now, 'Deployment approval window has expired.');
  assert(
    windowStartsAt <= now + 7 * 24 * 60 * 60 * 1000,
    'Deployment approval window cannot start more than seven days ahead.',
  );
  assert(
    windowEndsAt - windowStartsAt <= 24 * 60 * 60 * 1000,
    'Deployment approval window cannot exceed 24 hours.',
  );
  return {
    target: value.target,
    windowStartsAt: value.windowStartsAt,
    windowEndsAt: value.windowEndsAt,
    rollbackReleaseId: assertString(
      value.rollbackReleaseId,
      'deploymentApproval.rollbackReleaseId',
    ),
    rollbackArtifactSha256: assertSha256(
      value.rollbackArtifactSha256,
      'deploymentApproval.rollbackArtifactSha256',
    ),
    approverIds: assertUniqueSafeIds(
      value.approverIds,
      'deploymentApproval.approverIds',
      1,
    ),
  };
}

/**
 * @param {Record<string, any>} evidence
 * @param {Record<string, any>} releaseManifest
 * @param {{ now?: number, externalEvidenceSha256?: string }} [options]
 */
function validateExternalReleaseEvidence(
  evidence,
  releaseManifest,
  { now = Date.now(), externalEvidenceSha256 } = {},
) {
  assertExactKeys(
    evidence,
    [
      'appCheck',
      'backupRecovery',
      'deploymentApproval',
      'monitoring',
      'performance',
      'release',
      'releaseGovernance',
      'schemaVersion',
    ],
    'external evidence',
  );
  assert(evidence.schemaVersion === 1, 'External evidence schema must be 1.');
  const binding = validateReleaseBinding(evidence.release, releaseManifest);
  const backupRecovery = validateBackupRecovery(evidence.backupRecovery, now);
  const monitoring = validateMonitoring(evidence.monitoring, now);
  const releaseGovernance = validateReleaseGovernance(
    evidence.releaseGovernance,
  );
  const appCheck = validateAppCheck(
    evidence.appCheck,
    now,
    releaseGovernance.approvedSurfaces,
  );
  const performance = validatePerformance(evidence.performance, now);
  const deploymentApproval = validateDeploymentApproval(
    evidence.deploymentApproval,
    now,
  );
  assert(
    deploymentApproval.approverIds.includes(releaseGovernance.ownerId),
    'Single-developer owner must explicitly approve the deployment window.',
  );
  const evidenceSha256 = assertSha256(
    externalEvidenceSha256,
    'external evidence SHA-256',
  );
  const receiptBody = {
    schemaVersion: 1,
    status: 'accepted',
    acceptedAt: new Date(now).toISOString(),
    release: binding,
    externalEvidenceSha256: evidenceSha256,
    gates: {
      backupRecovery,
      monitoring,
      appCheck,
      performance,
      releaseGovernance,
      deploymentApproval,
    },
  };
  return {
    ...receiptBody,
    acceptanceSha256: acceptanceDigest(receiptBody),
  };
}

function verifyAcceptanceReceipt(
  receipt,
  releaseManifest,
  expectedEvidenceSha256,
) {
  assertExactKeys(
    receipt,
    [
      'acceptanceSha256',
      'acceptedAt',
      'externalEvidenceSha256',
      'gates',
      'release',
      'schemaVersion',
      'status',
    ],
    'acceptance receipt',
  );
  assert(receipt.schemaVersion === 1, 'Acceptance receipt schema must be 1.');
  assert(receipt.status === 'accepted', 'Acceptance receipt is not accepted.');
  validateReleaseBinding(receipt.release, releaseManifest);
  assertSha256(receipt.externalEvidenceSha256, 'receipt external evidence SHA-256');
  assert(
    receipt.externalEvidenceSha256
      === assertSha256(expectedEvidenceSha256, 'expected evidence SHA-256'),
    'Acceptance receipt does not match the approved external evidence hash.',
  );
  const { acceptanceSha256: recordedDigest, ...body } = receipt;
  assert(
    assertSha256(recordedDigest, 'acceptance receipt SHA-256')
      === acceptanceDigest(body),
    'Acceptance receipt checksum is invalid.',
  );
  assertObject(receipt.gates, 'acceptance receipt gates');
  assertExactKeys(
    receipt.gates,
    [
      'appCheck',
      'backupRecovery',
      'deploymentApproval',
      'monitoring',
      'performance',
      'releaseGovernance',
    ],
    'acceptance receipt gates',
  );
  return receipt;
}

async function assertRegularFile(path, label) {
  const metadata = await lstat(path).catch((error) => {
    if (error?.code === 'ENOENT') fail(`${label} is missing: ${path}`);
    throw error;
  });
  assert(metadata.isFile(), `${label} must be a regular file.`);
  assert(!metadata.isSymbolicLink(), `${label} cannot be a symbolic link.`);
}

async function readJson(path, label) {
  await assertRegularFile(path, label);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    assert(argument.startsWith('--'), `Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    const value = args[index + 1];
    assert(value && !value.startsWith('--'), `Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function requiredOption(options, key) {
  const value = String(options[key] || '').trim();
  assert(value, `--${key} is required.`);
  return resolve(value);
}

async function writePrivateReceipt(path, receipt) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(path, 0o600);
}

async function accept(options) {
  const evidencePath = requiredOption(options, 'evidence');
  const manifestPath = requiredOption(options, 'manifest');
  const outputPath = requiredOption(options, 'out');
  assert(
    evidencePath !== outputPath && manifestPath !== outputPath,
    'Acceptance output must not overwrite an input.',
  );
  await assertRegularFile(evidencePath, 'External evidence');
  const evidenceBytes = await readFile(evidencePath);
  const actualEvidenceSha256 = sha256(evidenceBytes);
  const expectedEvidenceSha256 = assertSha256(
    options['expected-sha256']
      || process.env.HUDDLEWAY_EXTERNAL_EVIDENCE_SHA256,
    'expected external evidence SHA-256',
  );
  assert(
    actualEvidenceSha256 === expectedEvidenceSha256,
    'External evidence file does not match its explicitly approved SHA-256.',
  );
  let evidence;
  try {
    evidence = JSON.parse(evidenceBytes);
  } catch (error) {
    fail(`External evidence is not valid JSON: ${error.message}`);
  }
  const manifest = await readJson(manifestPath, 'Release manifest');
  const receipt = validateExternalReleaseEvidence(evidence, manifest, {
    externalEvidenceSha256: actualEvidenceSha256,
  });
  await writePrivateReceipt(outputPath, receipt);
  console.log(`External release acceptance verified: ${receipt.acceptanceSha256}`);
}

async function verify(options) {
  const receiptPath = requiredOption(options, 'receipt');
  const manifestPath = requiredOption(options, 'manifest');
  const expectedEvidenceSha256 = options['expected-sha256']
    || process.env.HUDDLEWAY_EXTERNAL_EVIDENCE_SHA256;
  const receipt = await readJson(receiptPath, 'Acceptance receipt');
  const manifest = await readJson(manifestPath, 'Release manifest');
  verifyAcceptanceReceipt(receipt, manifest, expectedEvidenceSha256);
  console.log(`Acceptance receipt verified: ${receipt.acceptanceSha256}`);
}

async function main() {
  const [subcommand, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (subcommand === 'accept') return accept(options);
  if (subcommand === 'verify') return verify(options);
  fail(
    'Usage: crm-external-evidence.mjs <accept|verify> '
      + '--manifest PATH [--evidence PATH --out PATH | --receipt PATH] '
      + '--expected-sha256 SHA256',
  );
}

export {
  ACCEPTED_TARGET,
  APPROVED_RELEASE_SURFACES,
  GOOD_CWV_LIMITS,
  REQUIRED_ALERT_RECEIPTS,
  REQUIRED_APP_CHECK_PROVIDERS,
  REQUIRED_MONITORING_QUERIES,
  acceptanceDigest,
  validateExternalReleaseEvidence,
  verifyAcceptanceReceipt,
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`CRM external evidence gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}
