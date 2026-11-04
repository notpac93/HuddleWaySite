import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({ configFile: false, root, publicDir: resolve(root, '../../../public'), cacheDir: resolve(root, '../../../node_modules/.vite-messaging-fixture'), plugins: [svelte(), tailwindcss()], resolve: { alias: [{ find: /^.*\/(?:authStore|api\/(?:backendClient|RegistrationOutreachApi)|services\/DataStore)$/, replacement: resolve(root, 'data.ts') }] }, server: { host: '127.0.0.1', port: 8917, strictPort: true, fs: { allow: [resolve(root, '../../..')] } } });
await server.listen();
console.log('Local messaging fixture: http://127.0.0.1:8917');
