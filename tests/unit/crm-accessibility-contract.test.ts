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

describe('CRM accessibility and responsive contract', () => {
  it('gives every focus-managed dialog the required modal semantics', () => {
    const failures = components().flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const focusActions = source.match(/use:modalFocus/g)?.length ?? 0;
      if (focusActions === 0) return [];
      const dialogs = source.match(/role="dialog"/g)?.length ?? 0;
      const modalFlags = source.match(/aria-modal="true"/g)?.length ?? 0;
      const labelledDialogs = source.match(/aria-labelledby=/g)?.length ?? 0;
      return dialogs === focusActions
        && modalFlags === focusActions
        && labelledDialogs >= focusActions
        ? []
        : [
            `${relative(crmRoot, file)}: focus=${focusActions}, dialog=${dialogs}, modal=${modalFlags}, labels=${labelledDialogs}`,
          ];
    });
    expect(failures).toEqual([]);
  });

  it('keeps focus trap, Escape, and focus-return behavior centralized', () => {
    const action = readFileSync(
      join(process.cwd(), 'src/lib/ui/modalFocus.ts'),
      'utf8',
    );
    for (const contract of [
      "event.key === 'Escape'",
      "event.key !== 'Tab'",
      'document.activeElement === first',
      'document.activeElement === last',
      'previousFocus?.isConnected',
      'previousFocus.focus()',
    ]) {
      expect(action).toContain(contract);
    }
  });

  it('keeps keyboard-operable global search and mobile navigation', () => {
    const shell = readFileSync(join(crmRoot, 'CrmShell.svelte'), 'utf8');
    const search = readFileSync(join(crmRoot, 'GlobalSearch.svelte'), 'utf8');
    expect(shell).toContain("event.key.toLowerCase() === 'k'");
    expect(shell).toContain('initialFocusSelector:');
    expect(shell).toContain('mobileMenuTrigger?.focus()');
    expect(search).toContain("initialFocusSelector: '#global-search-input'");
    expect(search).toContain('aria-label="Search players, teams, or events"');
  });

  it('pins deterministic desktop and mobile authenticated browser coverage', () => {
    const e2e = readFileSync(
      join(process.cwd(), 'tests/e2e/authenticated-crm.spec.ts'),
      'utf8',
    );
    for (const contract of [
      'seedVerifiedOwner',
      'Search HuddleWay records',
      'toBeFocused()',
      "page.keyboard.press('Escape')",
      'Open navigation menu',
      'horizontalOverflow',
    ]) {
      expect(e2e).toContain(contract);
    }
  });
});
