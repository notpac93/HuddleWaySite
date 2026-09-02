import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTAL_ICON_PATHS } from '../../src/lib/ui/portalIcons';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Operations Portal experience foundations', () => {
  it('provides a distinct approved icon for every top-level destination', () => {
    const names = [
      'dashboard',
      'teams',
      'seasons',
      'roster',
      'events',
      'registration',
      'financials',
      'messages',
      'documents',
      'staff',
      'media',
      'myApp',
      'profile',
      'activity',
    ] as const;
    const signatures = names.map((name) => PORTAL_ICON_PATHS[name].join('|'));
    expect(new Set(signatures).size).toBe(names.length);
  });

  it('centralizes productive motion and a complete reduced-motion fallback', () => {
    const css = source('src/styles/portal-experience.css');
    for (const contract of [
      '--portal-motion-micro: 80ms',
      '--portal-motion-standard: 180ms',
      '--portal-motion-context: 220ms',
      'cubic-bezier(0.2, 0, 0.38, 0.9)',
      '@media (prefers-reduced-motion: reduce)',
      '.animate-spin, .animate-pulse',
      'animation: none !important',
    ]) {
      expect(css).toContain(contract);
    }
  });

  it('uses a labeled user-controlled sidebar instead of hover-only navigation', () => {
    const shell = source('src/components/crm/CrmShell.svelte');
    expect(shell).toContain("huddleway.crm.sidebar.expanded");
    expect(shell).toContain("'Collapse navigation' : 'Expand navigation'");
    expect(shell).toContain('Current portal scope');
    expect(shell).not.toContain('on:mouseenter');
    expect(shell).not.toContain('transition-all');
  });

  it('loads the approved product UI font only inside portal surfaces', () => {
    const layout = source('src/layouts/CrmLayout.astro');
    const css = source('src/styles/portal-experience.css');
    expect(layout).toContain("import '../styles/portal-experience.css'");
    expect(css).toContain("@fontsource/roboto/400.css");
    expect(css).toContain("--portal-font-ui: 'Roboto'");
  });
});
