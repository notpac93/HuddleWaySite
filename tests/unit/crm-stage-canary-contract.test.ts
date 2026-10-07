import { describe, expect, it } from 'vitest';
import {
  STAGE_CANARY,
  assertStageCanarySiteKeyHash,
  assertStageCanarySourceCommit,
  assertStageCanarySourceTreeClean,
  stageCanaryReleaseManifest,
  stageCanaryEnvironment,
} from '../../scripts/release/crm-stage-canary-contract.mjs';

const developmentKey = '6LcS8WctAAAAAFLbgIebAI1Ez4hfofwxrF6kYNes';
const commit = 'a'.repeat(40);
const previewCommit = 'b'.repeat(40);
const previewReleaseId = 'consumer-stage-bbbbbbbbbbbb';

const previewEnvironment = {
  HUDDLEWAY_STAGE_BACKEND_COMMIT: 'c'.repeat(40),
  PUBLIC_APP_PREVIEW_COMMIT: previewCommit,
  PUBLIC_APP_PREVIEW_RELEASE_ID: previewReleaseId,
};

describe('CRM stage-canary release contract', () => {
  it('rejects stale or dirty source before building', () => {
    expect(() => assertStageCanarySourceCommit(commit, commit)).not.toThrow();
    expect(() => assertStageCanarySourceCommit(commit, previewCommit)).toThrow(/does not match/i);
    expect(() => assertStageCanarySourceTreeClean('')).not.toThrow();
    expect(() => assertStageCanarySourceTreeClean(' M source.ts')).toThrow(/clean/i);
  });

  it('writes a complete manifest binding separate website, backend and preview sources', async () => {
    const environment = stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_WEBSITE_COMMIT: commit,
      ...previewEnvironment,
    });
    const { writeStageCanaryReleaseManifest } = await import('../../scripts/release/crm-stage-canary-artifact.mjs');
    expect(typeof writeStageCanaryReleaseManifest).toBe('function');
    expect(stageCanaryReleaseManifest(environment)).toMatchObject({
      mode: 'stage-canary', projectId: 'huddleway-dev', websiteCommit: commit,
      backendCommit: 'c'.repeat(40), appPreviewCommit: previewCommit,
      appPreviewReleaseId: previewReleaseId,
    });
    expect(() => stageCanaryReleaseManifest({ ...environment, PUBLIC_BACKEND_URL: 'https://api.huddleway.com' })).toThrow(/backend/i);
    expect(() => stageCanaryReleaseManifest({ ...environment, PUBLIC_FIREBASE_PROJECT_ID: 'sports-team-apps' })).toThrow(/huddleway-dev/i);
    expect(() => stageCanaryEnvironment({ HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey, PUBLIC_WEBSITE_COMMIT: commit, ...previewEnvironment, HUDDLEWAY_STAGE_BACKEND_COMMIT: 'short' })).toThrow(/backend commit/i);
  });
  it('binds the canary artifact to huddleway-dev and its registered App Check key', () => {
    const environment = stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_WEBSITE_COMMIT: commit,
      ...previewEnvironment,
      PUBLIC_FIREBASE_PROJECT_ID: 'sports-team-apps',
    });
    expect(environment).toMatchObject({
      PUBLIC_FIREBASE_PROJECT_ID: 'huddleway-dev',
      PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'true',
      PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_BACKEND_URL: STAGE_CANARY.backendUrl,
      PUBLIC_WEBSITE_COMMIT: commit,
      ...previewEnvironment,
    });
  });

  it('fails closed for missing, unknown, and production App Check keys', () => {
    expect(() => stageCanaryEnvironment({ PUBLIC_WEBSITE_COMMIT: commit })).toThrow(/required/i);
    expect(() => stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: 'unknown',
      PUBLIC_WEBSITE_COMMIT: commit,
      ...previewEnvironment,
    })).toThrow(/not the registered huddleway-dev/i);
    expect(() => assertStageCanarySiteKeyHash(
      STAGE_CANARY.forbiddenProductionSiteKeySha256,
    )).toThrow(/production App Check key is forbidden/i);
  });

  it('requires an exact source commit', () => {
    expect(() => stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_WEBSITE_COMMIT: 'short',
      ...previewEnvironment,
    })).toThrow(/40-character/i);
  });

  it('requires the exact consumer preview candidate identity', () => {
    expect(() => stageCanaryEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_WEBSITE_COMMIT: commit,
      PUBLIC_APP_PREVIEW_COMMIT: 'short',
      PUBLIC_APP_PREVIEW_RELEASE_ID: previewReleaseId,
    })).toThrow(/consumer commit/i);
  });
});
