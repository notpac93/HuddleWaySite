import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  STAGE_CANARY_RELEASE_FILENAME,
  writeStageCanaryReleaseManifest,
} from '../../scripts/release/crm-stage-canary-artifact.mjs';
import {
  STAGE_CANARY,
  assertStageCanarySourceCommit,
  assertStageCanarySourceTreeClean,
  assertStageCanarySiteKeyHash,
  stageCanaryEnvironment,
  stageCanaryReleaseManifest,
} from '../../scripts/release/crm-stage-canary-contract.mjs';

const developmentKey = '6LcS8WctAAAAAFLbgIebAI1Ez4hfofwxrF6kYNes';
const websiteCommit = 'a'.repeat(40);
const backendCommit = 'b'.repeat(40);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true })),
  );
});

function operatorEnvironment(overrides = {}) {
  return {
    HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: developmentKey,
    HUDDLEWAY_STAGE_BACKEND_COMMIT: backendCommit,
    PUBLIC_WEBSITE_COMMIT: websiteCommit,
    ...overrides,
  };
}

describe('CRM stage-canary release contract', () => {
  it('binds the canary artifact to huddleway-dev and its registered App Check key', () => {
    const environment = stageCanaryEnvironment(operatorEnvironment({
      PUBLIC_FIREBASE_PROJECT_ID: 'sports-team-apps',
    }));
    expect(environment).toMatchObject({
      PUBLIC_FIREBASE_PROJECT_ID: 'huddleway-dev',
      PUBLIC_FIREBASE_APP_CHECK_ENABLED: 'true',
      PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: developmentKey,
      PUBLIC_BACKEND_URL: STAGE_CANARY.backendUrl,
      PUBLIC_WEBSITE_COMMIT: websiteCommit,
      HUDDLEWAY_STAGE_BACKEND_COMMIT: backendCommit,
    });
  });

  it('fails closed for missing, unknown, and production App Check keys', () => {
    expect(() => stageCanaryEnvironment({
      HUDDLEWAY_STAGE_BACKEND_COMMIT: backendCommit,
      PUBLIC_WEBSITE_COMMIT: websiteCommit,
    })).toThrow(/required/i);
    expect(() => stageCanaryEnvironment(operatorEnvironment({
      HUDDLEWAY_STAGE_APP_CHECK_SITE_KEY: 'unknown',
    }))).toThrow(/not the registered huddleway-dev/i);
    expect(() => assertStageCanarySiteKeyHash(
      STAGE_CANARY.forbiddenProductionSiteKeySha256,
    )).toThrow(/production App Check key is forbidden/i);
  });

  it('requires exact website and backend commits', () => {
    expect(() => stageCanaryEnvironment(operatorEnvironment({
      PUBLIC_WEBSITE_COMMIT: 'short',
    }))).toThrow(/PUBLIC_WEBSITE_COMMIT.*40-character/i);
    expect(() => stageCanaryEnvironment(operatorEnvironment({
      HUDDLEWAY_STAGE_BACKEND_COMMIT: 'short',
    }))).toThrow(/HUDDLEWAY_STAGE_BACKEND_COMMIT.*40-character/i);
    expect(() => assertStageCanarySourceCommit(
      websiteCommit,
      'c'.repeat(40),
    )).toThrow(/does not match/i);
    expect(() => assertStageCanarySourceTreeClean(' M src/example.ts'))
      .toThrow(/must be clean/i);
  });

  it('writes a public manifest with exact staging provenance', async () => {
    const output = await mkdtemp(join(tmpdir(), 'huddleway-stage-canary-'));
    temporaryDirectories.push(output);
    const environment = stageCanaryEnvironment(operatorEnvironment());

    const result = await writeStageCanaryReleaseManifest(output, environment);

    expect(result.manifest).toEqual({
      schemaVersion: 1,
      mode: 'stage-canary',
      projectId: STAGE_CANARY.projectId,
      hostingSite: STAGE_CANARY.hostingSite,
      websiteCommit,
      backendCommit,
      backendUrl: STAGE_CANARY.backendUrl,
    });
    expect(JSON.parse(await readFile(
      join(output, STAGE_CANARY_RELEASE_FILENAME),
      'utf8',
    ))).toEqual(result.manifest);
  });

  it('fails closed if manifest provenance is changed from huddleway-dev', () => {
    const environment = stageCanaryEnvironment(operatorEnvironment());
    expect(() => stageCanaryReleaseManifest({
      ...environment,
      PUBLIC_FIREBASE_PROJECT_ID: 'sports-team-apps',
    })).toThrow(/must target huddleway-dev/i);
    expect(() => stageCanaryReleaseManifest({
      ...environment,
      PUBLIC_BACKEND_URL: 'https://example.invalid',
    })).toThrow(/huddleway-dev backend/i);
  });

  it('routes the well-known URL to the generated static manifest', async () => {
    const firebaseConfig = JSON.parse(await readFile(
      new URL('../../firebase.stage-canary.json', import.meta.url),
      'utf8',
    ));
    expect(firebaseConfig.hosting.rewrites[0]).toEqual({
      source: STAGE_CANARY.releaseManifestPath,
      destination: `/${STAGE_CANARY_RELEASE_FILENAME}`,
    });
  });
});
