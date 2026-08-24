import { spawnSync } from 'node:child_process';
import { stageCanaryEnvironment } from './release/crm-stage-canary-contract.mjs';

const explicit = stageCanaryEnvironment(process.env);
const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, ...explicit },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
