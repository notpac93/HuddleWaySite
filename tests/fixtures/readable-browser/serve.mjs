// Local-only visual QA: production components with in-memory records, no cloud access.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({
  configFile: false, root,
  plugins: [svelte(), tailwindcss()],
  resolve: { alias: [
    { find: /^.*\/authStore$/, replacement: resolve(root, 'data.ts') },
    { find: /^.*\/api\/backendClient$/, replacement: resolve(root, 'data.ts') },
    { find: /^.*\/services\/DataStore$/, replacement: resolve(root, 'data.ts') },
  ] },
  server: { host: '127.0.0.1', port: 8879, strictPort: true, fs: { allow: [resolve(root, '../../..')] } },
});
await server.listen();
console.log('Read-only fixture preview: http://127.0.0.1:8879');
