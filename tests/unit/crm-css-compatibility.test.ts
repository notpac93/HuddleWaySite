import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transform } from 'lightningcss';
import { describe, expect, it } from 'vitest';
import config from '../../astro.config.mjs';
import { assertCompatibleMediaQueries, checkBuiltCrmCss, crmCssTarget, crmCssTargets } from '../../scripts/crm-css-compatibility.mjs';

describe('native CRM CSS browser contract', () => {
  it('keeps transformation and final minification on the declared iOS minimum', () => {
    expect(crmCssTarget).toBe('safari15.5');
    expect(config.vite?.build?.cssTarget).toBe(crmCssTarget);
    expect(config.vite?.css?.lightningcss?.targets).toEqual(crmCssTargets);
    const input = Buffer.from('@media (max-width:767px){.shell{flex-direction:column}} @media (width >= 768px){.shell{flex-direction:row}}');
    const result = transform({ filename: 'shell.css', code: input, targets: crmCssTargets, minify: true }).code.toString();
    expect(result).toContain('(max-width:767px)');
    expect(result).toContain('(min-width:768px)');
    expect(() => assertCompatibleMediaQueries(result)).not.toThrow();
    // This is the exact regression from the formerly unbounded minifier.
    const incompatible = transform({ filename: 'shell.css', code: input, minify: true }).code.toString();
    expect(() => assertCompatibleMediaQueries(incompatible)).toThrow(/Safari 16.4/);
  });

  it('checks every output asset, including nested lazy detail styles', () => {
    const directory = mkdtempSync(join(tmpdir(), 'crm-css-contract-'));
    try {
      mkdirSync(join(directory, '_astro'));
      writeFileSync(join(directory, 'initial.css'), '@media (max-width:767px){.shell{display:block}}');
      writeFileSync(join(directory, '_astro', 'detail.css'), '@media (min-width:768px){.detail{display:grid}}');
      expect(checkBuiltCrmCss(directory)).toBe(2);
      writeFileSync(join(directory, '_astro', 'detail.css'), '@media (width<=767px){.detail{display:grid}}');
      expect(() => checkBuiltCrmCss(directory)).toThrow(/detail.css/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
