import { createHash } from 'node:crypto';

export const STAGE_CANARY = Object.freeze({
  projectId: 'huddleway-dev',
  hostingSite: 'huddleway-crm-canary',
  backendUrl: 'https://huddleway-backend-dev-hnnitshwoq-uc.a.run.app',
  appCheckSiteKeySha256: 'a4c2d12fd44ea1151157bd42ce3fccfc27846c6f005b90a8205e518374cf9a26',
  forbiddenProductionSiteKeySha256: '737b2e72c4807873dc2bedd8b36628c7df355d1f48f6c7586185a58f555bb862',
});

export function sha256(value) {
  return createHash('sha256').update(String(value || '').trim()).digest('hex');
}

export function assertStageCanarySiteKeyHash(siteKeyHash) {
  if (siteKeyHash === STAGE_CANARY.forbiddenProductionSiteKeySha256) {
    throw new Error('The production App Check key is forbidden in a stage-canary build.');
  }
  if (siteKeyHash !== STAGE_CANARY.appCheckSiteKeySha256) {
    throw new Error('The App Check key is not the registered huddleway-dev canary key.');
  }
}

export function stageCanaryEnvironment(operatorEnvironment = process.env) {
  const siteKey = String(operatorEnvironment.HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY || '').trim();
  const siteKeyHash = sha256(siteKey);
  if (!siteKey) {
    throw new Error('HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY is required for the stage-canary build.');
  }
  assertStageCanarySiteKeyHash(siteKeyHash);
  const commit = String(operatorEnvironment.PUBLIC_WEBSITE_COMMIT || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('PUBLIC_WEBSITE_COMMIT must be the exact 40-character website commit.');
  }
  const previewCommit = String(operatorEnvironment.PUBLIC_APP_PREVIEW_COMMIT || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(previewCommit)) {
    throw new Error('PUBLIC_APP_PREVIEW_COMMIT must be the exact 40-character consumer commit.');
  }
  const previewReleaseId = String(operatorEnvironment.PUBLIC_APP_PREVIEW_RELEASE_ID || '').trim();
  if (!previewReleaseId) {
    throw new Error('PUBLIC_APP_PREVIEW_RELEASE_ID is required for the stage-canary build.');
  }
  const backendCommit = exactCommit(operatorEnvironment.HUDDLEWAY_STAGE_BACKEND_COMMIT, 'backend commit');
  return {
    PUBLIC_BACKEND_URL: STAGE_CANARY.backendUrl,
    PUBLIC_FIREBASE_API_KEY: 'AIzaSyDVZSVTxyiRh2TUIIE6ACmOLgdOPqB3TvA',
    PUBLIC_FIREBASE_APP_ID: '1:630775109089:web:117ca765cab994f2ee2ea0',
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '630775109089',
    PUBLIC_FIREBASE_PROJECT_ID: STAGE_CANARY.projectId,
    PUBLIC_FIREBASE_AUTH_DOMAIN: 'huddleway-dev.firebaseapp.com',
    PUBLIC_FIREBASE_STORAGE_BUCKET: 'huddleway-dev.firebasestorage.app',
    PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'true',
    PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: siteKey,
    PUBLIC_FIREBASE_USE_EMULATORS: 'false',
    PUBLIC_WEBSITE_COMMIT: commit,
    HUDDLEWAY_STAGE_BACKEND_COMMIT: backendCommit,
    PUBLIC_APP_PREVIEW_ENVIRONMENT: 'stage',
    PUBLIC_APP_PREVIEW_COMMIT: previewCommit,
    PUBLIC_APP_PREVIEW_RELEASE_ID: previewReleaseId,
  };
}

function exactCommit(value, name) {
  const commit = String(value || '').trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`${name} must be an exact 40-character commit.`);
  return commit;
}

export function assertStageCanarySourceCommit(declaredCommit, sourceCommit) {
  if (exactCommit(declaredCommit, 'PUBLIC_WEBSITE_COMMIT') !== exactCommit(sourceCommit, 'website source commit')) {
    throw new Error('PUBLIC_WEBSITE_COMMIT does not match the checked-out website source commit.');
  }
}

export function assertStageCanarySourceTreeClean(statusOutput) {
  if (String(statusOutput || '').trim()) throw new Error('The stage-canary website source tree must be clean before building.');
}

export function stageCanaryReleaseManifest(environment) {
  if (environment.PUBLIC_FIREBASE_PROJECT_ID !== STAGE_CANARY.projectId) {
    throw new Error('The stage-canary release manifest must target huddleway-dev.');
  }
  if (environment.PUBLIC_BACKEND_URL !== STAGE_CANARY.backendUrl) {
    throw new Error('The stage-canary release manifest must target the huddleway-dev backend.');
  }
  if (environment.PUBLIC_APP_PREVIEW_ENVIRONMENT !== 'stage' || !String(environment.PUBLIC_APP_PREVIEW_RELEASE_ID || '').trim()) {
    throw new Error('The stage-canary preview identity is required.');
  }
  return {
    schemaVersion: 1,
    mode: 'stage-canary',
    projectId: STAGE_CANARY.projectId,
    hostingSite: STAGE_CANARY.hostingSite,
    websiteCommit: exactCommit(environment.PUBLIC_WEBSITE_COMMIT, 'PUBLIC_WEBSITE_COMMIT'),
    backendCommit: exactCommit(environment.HUDDLEWAY_STAGE_BACKEND_COMMIT, 'backend commit'),
    backendUrl: STAGE_CANARY.backendUrl,
    appPreviewCommit: exactCommit(environment.PUBLIC_APP_PREVIEW_COMMIT, 'consumer commit'),
    appPreviewReleaseId: environment.PUBLIC_APP_PREVIEW_RELEASE_ID,
  };
}
