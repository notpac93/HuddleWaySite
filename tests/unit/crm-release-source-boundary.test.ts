import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const absolutePath = resolve(directory, entry);
      return statSync(absolutePath).isDirectory()
        ? sourceFiles(absolutePath)
        : [absolutePath];
    })
    .filter((file) => /\.(?:astro|svelte|ts|js)$/.test(file));
}

describe('CRM release source boundary', () => {
  it('keeps synthetic registration datasets outside production source', () => {
    expect(existsSync(resolve(sourceRoot, 'lib/testFixtures.ts'))).toBe(false);

    const offenders = sourceFiles(sourceRoot)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          source.includes('FIXTURE_REGISTRATIONS')
          || /fixture_reg_\d+/.test(source)
        );
      })
      .map((file) => file.replace(`${process.cwd()}/`, ''));

    expect(offenders).toEqual([]);
  });
});
