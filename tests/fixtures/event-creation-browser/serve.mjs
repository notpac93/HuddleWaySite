import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({ configFile: false, root, cacheDir: resolve(root, '../../../node_modules/.vite-event-fixture'), plugins: [svelte(), tailwindcss()], resolve: { alias: [{ find: /^.*\/(?:authStore|api\/backendClient|services\/(?:DataStore|RegistrationService))$/, replacement: resolve(root, 'data.ts') }] }, server: { host: '127.0.0.1', port: 8881, strictPort: true, fs: { allow: [resolve(root, '../../..')] } } });
await server.listen();
console.log('Local event fixture: http://127.0.0.1:8881');
