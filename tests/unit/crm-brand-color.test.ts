import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CRM_ROOT = resolve('src/components/crm');
const CRM_STYLES = resolve('src/styles/crm.css');
const SOURCE_EXTENSIONS = new Set(['.svelte', '.ts', '.css']);
const RETIRED_ACCENTS = /#(?:00a4bd|008194|006d7c|007f91)\b|\bcyan-\d+/i;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}

describe('CRM brand color contract', () => {
  it('does not reintroduce the retired teal and cyan accent palette', async () => {
    const files = [...await sourceFiles(CRM_ROOT), CRM_STYLES];
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (RETIRED_ACCENTS.test(source)) violations.push(file);
    }

    expect(violations).toEqual([]);
  });
});
