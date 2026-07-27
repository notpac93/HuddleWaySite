import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const siteCopy = readFileSync(
  join(process.cwd(), 'src/data/site.ts'),
  'utf8',
);

describe('CRM marketing claims remain release-safe', () => {
  it.each([
    /ready for launch/i,
    /up to a \$1/i,
    /30%\s+app[- ]store/i,
    /activation pricing/i,
    /activation entitlement/i,
    /money back/i,
    /without bouncing across/i,
    /without splitting the workflow/i,
    /more likely to come back/i,
    /better retention/i,
  ])('does not publish the unapproved claim %s', (pattern) => {
    expect(siteCopy).not.toMatch(pattern);
  });

  it('states the verified free-admin boundary without promising free payment processing', () => {
    expect(siteCopy).toMatch(/creating and administering a program is free/i);
    expect(siteCopy).toMatch(
      /connecting Stripe is optional and only needed if the program chooses to collect payments/i,
    );
    expect(siteCopy).not.toMatch(/payment processing is free/i);
  });

  it('qualifies connected-account payment and pricing language', () => {
    expect(siteCopy).toMatch(/configured Stripe connected account/i);
    expect(siteCopy).toMatch(/eligible payment steps/i);
    expect(siteCopy).toMatch(/configured connected-account payment flow/i);
    expect(siteCopy).toMatch(
      /pricing, processor fees, payout timing, and availability depend/i,
    );
  });

  it('does not present divisions or households as universal canonical records', () => {
    expect(siteCopy).toMatch(
      /division hierarchy, household management, or cross-team reporting requirement/i,
    );
    expect(siteCopy).toMatch(/not represented as universal standalone records/i);
  });
});
