import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep lazy feature styles split, but deliver the initial Admin cascade in one
// cacheable request. The bundle stays beside its source files so font/image URLs
// retain their meaning. Other routes still use the original shared stylesheets.
export async function consolidateAdminStyles(directory) {
  const page = join(directory, 'admin/index.html');
  const html = await readFile(page, 'utf8');
  const links = [...html.matchAll(/<link rel="stylesheet" href="(\/_astro\/[^"/]+\.css)">/g)];
  if (links.length < 2) return;
  const css = (await Promise.all(links.map((link) =>
    readFile(join(directory, link[1].slice(1)), 'utf8')))).join('\n');
  const hash = createHash('sha256').update(css).digest('hex').slice(0, 16);
  const href = `/_astro/admin-initial.${hash}.css`;
  await writeFile(join(directory, href.slice(1)), css);
  let first = true;
  const updated = html.replace(/<link rel="stylesheet" href="(\/_astro\/[^"/]+\.css)">/g, () => {
    if (!first) return '';
    first = false;
    return `<link rel="stylesheet" href="${href}">`;
  });
  await writeFile(page, updated);
}

export default function adminStyles() {
  return {
    name: 'admin-initial-styles',
    hooks: {
      'astro:build:done': ({ dir }) => consolidateAdminStyles(fileURLToPath(dir)),
    },
  };
}
