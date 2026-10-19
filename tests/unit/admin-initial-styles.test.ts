import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { consolidateAdminStyles } from '../../scripts/consolidate-admin-styles.mjs';

test('initial styles preserve cascade and relative assets without consuming lazy styles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'admin-styles-'));
  try {
    await mkdir(join(root, 'admin'));
    await mkdir(join(root, '_astro'));
    const first = '.title{color:red;background:url(./logo.svg)}';
    const last = '.title{color:blue}';
    await writeFile(join(root, '_astro/a.css'), first);
    await writeFile(join(root, '_astro/b.css'), last);
    await writeFile(join(root, '_astro/lazy.css'), '.lazy{color:green}');
    const html = '<link rel="stylesheet" href="/_astro/a.css"><link rel="stylesheet" href="/_astro/b.css"><main>Admin</main>';
    await writeFile(join(root, 'admin/index.html'), html);
    await consolidateAdminStyles(root);
    const output = await readFile(join(root, 'admin/index.html'), 'utf8');
    const asset = output.match(/href="([^"]+)"/)![1];
    expect(output.match(/rel="stylesheet"/g)).toHaveLength(1);
    expect(output).toContain('<main>Admin</main>');
    expect(await readFile(join(root, asset.slice(1)), 'utf8')).toBe(`${first}\n${last}`);
    expect(await readFile(join(root, '_astro/a.css'), 'utf8')).toBe(first);
    await consolidateAdminStyles(root);
    expect(await readFile(join(root, 'admin/index.html'), 'utf8')).toBe(output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
