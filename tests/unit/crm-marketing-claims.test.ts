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

  it('states the verified zero-monthly-cost boundary without promising free payment processing', () => {
    expect(siteCopy).toMatch(/recurring HuddleWay software cost is \$0\/month/i);
    expect(siteCopy).toMatch(/Stripe setup is optional for programs that collect payments/i);
    expect(siteCopy).not.toMatch(/payment processing is free/i);
  });

  it('qualifies connected-account payment and pricing language', () => {
    expect(siteCopy).toMatch(/payments are processed through your connected Stripe account/i);
    expect(siteCopy).toMatch(/qualifying payment/i);
    expect(siteCopy).toMatch(/HuddleWay fee never exceeds \$1/i);
    expect(siteCopy).toMatch(/processing fees, availability, and payout timing depend/i);
  });

  it('does not present divisions or households as universal canonical records', () => {
    expect(siteCopy).toMatch(
      /special division structure, household setup, or cross-team report/i,
    );
    expect(siteCopy).toMatch(/confirm that requirement during setup/i);
  });
});
