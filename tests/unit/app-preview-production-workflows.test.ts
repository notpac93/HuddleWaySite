import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

async function workflow(name: string) {
  return readFile(resolve('.github/workflows', name), 'utf8');
}

describe('production My App parity deployment gates', () => {
  it('keeps forbidden public Firebase overrides out of owner release artifacts', async () => {
    const source = await workflow('crm-release-gate.yml');
    expect(source).not.toContain('PUBLIC_FIREBASE_PROJECT_ID: sports-team-apps');
    expect(source).not.toContain('PUBLIC_FIREBASE_USE_EMULATORS: "false"');
  });

  it('binds the single-developer post-deploy probe to exact workflow inputs', async () => {
    const source = await workflow('crm-production-deploy.yml');
    expect(source).toContain('name: Install pinned Playwright browser');
    expect(source).toContain('run: npx playwright install --with-deps chromium');
    expect(source).toContain(
      'APP_PREVIEW_EXPECTED_SOURCE_COMMIT: ${{ inputs.backend_contract_ref }}',
    );
    expect(source).toContain(
      'APP_PREVIEW_EXPECTED_RELEASE_ID: ${{ inputs.consumer_release_id }}',
    );
    expect(source).toContain(
      'APP_PREVIEW_EXPECTED_ARTIFACT_SHA256: ${{ inputs.consumer_artifact_sha256 }}',
    );
    expect(source).toContain('npm run test:preview-parity:prod');
    expect(source).toContain('The deployment is not accepted.');
    expect(source).toContain('Manual rollback required: revert the production commit');
    expect(source.indexOf('name: Require exact production My App parity'))
      .toBeGreaterThan(source.indexOf('name: Verify the published site and backend'));
  });

  it('extracts owner-flow identity from the verified manifest before its rollback gate', async () => {
    const source = await workflow('crm-owner-production-deploy.yml');
    expect(source).toContain('node-version-file: .node-version');
    expect(source).toContain('run: npm install --global npm@11.5.2');
    expect(source).toContain('run: npm ci');
    expect(source).toContain('run: npx playwright install --with-deps chromium');
    expect(source).toContain("manifest?.backendContract?.commit");
    expect(source).toContain("manifest?.consumerApp?.releaseId");
    expect(source).toContain("manifest?.consumerApp?.artifactSha256");
    expect(source).toContain('APP_PREVIEW_EXPECTED_SOURCE_COMMIT=${sourceCommit}');
    expect(source).toContain('APP_PREVIEW_EXPECTED_RELEASE_ID=${releaseId}');
    expect(source).toContain('APP_PREVIEW_EXPECTED_ARTIFACT_SHA256=${artifactSha256}');
    expect(source).toContain('npm run test:preview-parity:prod');

    const verification = source.indexOf('name: Verify the live CRM and backend health');
    const parity = source.indexOf('name: Require exact production My App parity');
    const rollback = source.indexOf('name: Roll back automatically after a failed live verification');
    expect(parity).toBeGreaterThan(verification);
    expect(rollback).toBeGreaterThan(parity);
    expect(source).toContain('Automatic CRM rollback will run.');
    expect(source).toContain("if: failure() && env.DEPLOYMENT_PUSHED == 'true'");
  });
});
