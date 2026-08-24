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
  };
}
