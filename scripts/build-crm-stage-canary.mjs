import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { writeStageCanaryReleaseManifest } from './release/crm-stage-canary-artifact.mjs';
import {
  assertStageCanarySourceCommit,
  assertStageCanarySourceTreeClean,
  stageCanaryEnvironment,
} from './release/crm-stage-canary-contract.mjs';

const explicit = stageCanaryEnvironment(process.env);
const sourceCommitResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (sourceCommitResult.error) throw sourceCommitResult.error;
if (sourceCommitResult.status !== 0) {
  throw new Error('Unable to resolve the checked-out website source commit.');
}
assertStageCanarySourceCommit(
  explicit.PUBLIC_WEBSITE_COMMIT,
  sourceCommitResult.stdout,
);
const sourceStatusResult = spawnSync('git', ['status', '--porcelain'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (sourceStatusResult.error) throw sourceStatusResult.error;
if (sourceStatusResult.status !== 0) {
  throw new Error('Unable to inspect the website source tree.');
}
assertStageCanarySourceTreeClean(sourceStatusResult.stdout);
const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, ...explicit },
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  await writeStageCanaryReleaseManifest(join(process.cwd(), 'dist'), explicit);
}
