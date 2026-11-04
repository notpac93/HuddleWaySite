import './sync-catalog.mjs';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({ configFile: false, root,
  cacheDir: resolve(root, '../../../node_modules/.vite-layout-fixture'),
  plugins: [svelte(), tailwindcss()],
  define: { 'import.meta.env.VITE_REAL_CONSUMER_PREVIEW_URL': JSON.stringify(process.env.REAL_CONSUMER_PREVIEW_URL || '') },
  resolve: { alias: [
    { find: /^.*\/(?:authStore|api\/backendClient)$/, replacement: resolve(root, 'data.ts') },
    { find: /^.*\/config\/publicEnvironment$/, replacement: resolve(root, 'environment.ts') },
  ] },
  server: { host: '127.0.0.1', port: 8892, strictPort: true, fs: { allow: [resolve(root, '../../..')] } },
});
await server.listen();
console.log('Local layout fixture: http://127.0.0.1:8892');
