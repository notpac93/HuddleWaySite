import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keep both the CSS transformer and final minifier on the native OS contract.
export const crmCssTarget = 'safari15.5';
export const crmCssTargets = { safari: (15 << 16) | (5 << 8) };

export function assertCompatibleMediaQueries(css, filename = 'CSS') {
  const commentsRemoved = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of commentsRemoved.matchAll(/@media\s*([^{}]+)\{/g)) {
    if (/[<>]/.test(match[1])) {
      throw new Error(`${filename}: media-query range syntax requires Safari 16.4; native minimum is iOS 15.5.`);
    }
  }
}

export function checkBuiltCrmCss(directory) {
  let count = 0;
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const filename = join(path, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && entry.name.endsWith('.css')) {
        assertCompatibleMediaQueries(readFileSync(filename, 'utf8'), filename);
        count += 1;
      }
    }
  }
  visit(directory);
  if (!count) throw new Error('No built CSS assets were found to validate.');
  return count;
}
