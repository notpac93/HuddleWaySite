import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const crmRoot = join(process.cwd(), 'src/components/crm');

function components(directory = crmRoot): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const file = join(directory, entry.name);
      return entry.isDirectory()
        ? components(file)
        : file.endsWith('.svelte')
          ? [file]
          : [];
    })
    .sort();
}

describe('CRM release language contract', () => {
  it('reviews the entire 49-component release tree', () => {
    expect(components().map((file) => relative(crmRoot, file))).toHaveLength(49);
  });

  it('rejects simulated, placeholder, and raw exception language', () => {
    const forbidden = [
      /coming soon/i,
      /functionality would/i,
      /simulate api/i,
      /mock (?:record|data|payment|metric)/i,
      /dummy (?:record|data|payment|metric)/i,
      /\{\s*(?:error|err|exception)\.message\s*\}/i,
      /window\.(?:alert|confirm)\s*\(/i,
    ];
    const failures = components().flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return forbidden
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relative(crmRoot, file)}: ${pattern}`);
    });
    expect(failures).toEqual([]);
  });

  it('keeps internal troubleshooting identifiers out of tenant-facing copy', () => {
    const source = components()
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/support request:/i);
  });

  it('keeps the free-admin and optional-payment boundary consistent', () => {
    const login = readFileSync(join(crmRoot, 'Login.svelte'), 'utf8');
    const setup = readFileSync(join(crmRoot, 'SetupWorkflow.svelte'), 'utf8');
    const app = readFileSync(join(crmRoot, 'CrmApp.svelte'), 'utf8');
    const marketing = readFileSync(
      join(process.cwd(), 'src/data/site.ts'),
      'utf8',
    );

    expect(login).toContain('Creating and administering a program is free.');
    expect(login).toContain('Create free admin account');
    expect(setup).toContain(
      'Program creation and administration are free. No payment method is required.',
    );
    expect(setup).toContain('Skip payment setup');
    expect(app).toContain('Organization setup is managed by HuddleWay');
    expect(app).not.toContain("import('./SetupWorkflow.svelte')");
    expect(marketing).toContain('Your recurring HuddleWay software cost is $0/month.');

    for (const text of [login, setup, app, marketing]) {
      expect(text).not.toMatch(
        /(?:activation payment|activation entitlement|\$\s*99|admin subscription required)/i,
      );
    }
  });

  it('states excluded financial capabilities instead of teasing them', () => {
    const financials = readFileSync(join(crmRoot, 'Financials.svelte'), 'utf8');
    expect(financials).not.toContain('Launch capability boundary');
    expect(financials).not.toContain('Audited financial period locks');
    expect(financials).not.toContain('Configurable installment schedules');
    expect(financials).not.toMatch(/set up installments|add scholarship|apply credit/i);
  });

  it('keeps routine CRM actions free of generic audit-reason prompts', () => {
    const source = components()
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(source).not.toContain('Reason for change');
    expect(source).not.toContain('Open details');
    expect(source).not.toMatch(/>\s*Recall\s*</);
  });
});
