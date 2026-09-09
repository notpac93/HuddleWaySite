import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { stageCanaryReleaseManifest } from './crm-stage-canary-contract.mjs';

export const STAGE_CANARY_RELEASE_FILENAME = 'huddleway-crm-release.json';

export async function writeStageCanaryReleaseManifest(outputDirectory, environment) {
  const target = resolve(outputDirectory);
  const manifest = stageCanaryReleaseManifest(environment);
  await mkdir(target, { recursive: true });
  const path = join(target, STAGE_CANARY_RELEASE_FILENAME);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, path };
}
