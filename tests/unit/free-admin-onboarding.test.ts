import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (fileName: string) =>
  readFileSync(
    join(process.cwd(), 'src/components/crm', fileName),
    'utf8',
  );

describe('free administrator onboarding contract', () => {
  it('offers account creation and email verification without an activation gate', () => {
    const login = source('Login.svelte');

    expect(login).toContain('Create free admin account');
    expect(login).toContain('createUserWithEmailAndPassword');
    expect(login).toContain('sendEmailVerification');
    expect(login).toContain('Creating and administering a program is free.');
    expect(login).not.toMatch(/activation entitlement|activation contact|\$99/i);
  });

  it('routes verified administrators with no tenant into setup', () => {
    const app = source('CrmApp.svelte');

    expect(app).toContain('$userStore.emailVerified');
    expect(app).toContain("import('./SetupWorkflow.svelte')");
    expect(app).toContain('this={setupComponent}');
    expect(app).toContain('Setup could not be loaded');
    expect(app).toContain('Program setup is free.');
    expect(app).not.toMatch(/activation entitlement|activation contact/i);
  });

  it('makes payment configuration optional throughout setup', () => {
    const setup = source('SetupWorkflow.svelte');

    expect(setup).toContain(
      'Program creation and administration are free. No payment method is required.',
    );
    expect(setup).toContain('Skip payment setup');
    expect(setup).toContain(
      'Connect Stripe later only if your program chooses to collect participant fees.',
    );
    expect(setup).not.toMatch(/activation fee[^<]*required|activation payment/i);
  });
});
