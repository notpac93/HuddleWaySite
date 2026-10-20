import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkBuiltCrmCss } from './crm-css-compatibility.mjs';

// Evaluating the actual production entry catches vendor chunk initialization
// cycles that unit tests and Astro's development server do not exercise.
const dist = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const cssAssetCount = checkBuiltCrmCss(dist);
console.log(`PASS: all ${cssAssetCount} built CSS assets preserve native media-query compatibility.`);
const html = readFileSync(resolve(dist, 'admin/login/index.html'), 'utf8');
const entry = html.match(/component-url="([^"]*CrmApp\.[^"]+\.js)"/)?.[1];
if (!entry || !entry.startsWith('/_astro/')) throw new Error('Built CRM login entry is missing.');
const url = pathToFileURL(resolve(dist, entry.slice(1))).href;
const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], {
  encoding: 'utf8', timeout: 20000,
});
if (result.error || result.status !== 0) {
  const diagnostic = String(result.stderr || '').split('\n').find(line => /^(?:TypeError|ReferenceError|Error):/.test(line));
  throw new Error(`Built CRM initialization failed: ${diagnostic || result.error?.message || 'module evaluation failed'}`);
}
console.log('PASS: built CRM entry initializes without vendor-order exceptions.');
