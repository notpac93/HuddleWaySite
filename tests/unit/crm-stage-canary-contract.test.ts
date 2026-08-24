import { describe, expect, it } from 'vitest';
import {
  STAGE_CANARY,
  assertStageCanarySiteKeyHash,
  stageCanaryEnvironment,
} from '../../scripts/release/crm-stage-canary-contract.mjs';

const developmentKey = '6LcS8WctAAAAAFLbgIebAI1Ez4hfofwxrF6kYNes';
const commit = 'a'.repeat(40);

describe('CRM stage-canary release contract', () => {
  it('binds the canary artifact to huddleway-dev and its registered App Check key', () => {
    const environment = stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_WEBSITE_COMMIT: commit,
      PUBLIC_FIREBASE_PROJECT_ID: 'sports-team-apps',
    });
    expect(environment).toMatchObject({
      PUBLIC_FIREBASE_PROJECT_ID: 'huddleway-dev',
      PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'true',
      PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_BACKEND_URL: STAGE_CANARY.backendUrl,
      PUBLIC_WEBSITE_COMMIT: commit,
    });
  });

  it('fails closed for missing, unknown, and production App Check keys', () => {
    expect(() => stageCanaryEnvironment({ PUBLIC_WEBSITE_COMMIT: commit })).toThrow(/required/i);
    expect(() => stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: 'unknown',
      PUBLIC_WEBSITE_COMMIT: commit,
    })).toThrow(/not the registered huddleway-dev/i);
    expect(() => assertStageCanarySiteKeyHash(
      STAGE_CANARY.forbiddenProductionSiteKeySha256,
    )).toThrow(/production App Check key is forbidden/i);
  });

  it('requires an exact source commit', () => {
    expect(() => stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_WEBSITE_COMMIT: 'short',
    })).toThrow(/40-character/i);
  });
});
