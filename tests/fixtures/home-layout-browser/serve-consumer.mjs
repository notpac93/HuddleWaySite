import './sync-catalog.mjs';
// Development-only host for the normal main_consumer.dart build. Public sample
// responses replace external services; no production API or writes are exposed.
import { createServer } from 'node:http';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const fixtureRoot = fileURLToPath(new URL('.', import.meta.url));
const content = JSON.parse(await readFile(resolve(fixtureRoot, 'content.json'), 'utf8'));
const root = resolve(process.env.CONSUMER_BUILD_DIR || '/tmp/huddleway-canvas-real-app');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8893');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:8892');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (process.env.DEBUG_CONSUMER_CONSOLE === '1' && req.method === 'POST' && url.pathname === '/__console' && req.headers.origin === 'http://127.0.0.1:8893') {
    let message = ''; for await (const chunk of req) { message += chunk; if (message.length > 16000) break; }
    await appendFile('/tmp/huddleway-consumer-console.log', message.slice(0, 16000) + '\n'); res.writeHead(204); return res.end();
  }
  if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
  if (url.pathname.startsWith('/public/')) {
    res.setHeader('Content-Type', 'application/json');
    if (url.searchParams.get('tenantId') && url.searchParams.get('tenantId') !== 'layout-fixture') { res.writeHead(404); return res.end('{}'); }
    if (url.pathname === '/public/page-bundle') {
      const page = content.pages.find(page => url.searchParams.get('pageId') ? page.id === url.searchParams.get('pageId') : page.route === (url.searchParams.get('route') || '/'));
      if (!page) { res.writeHead(404); return res.end('{}'); }
      return res.end(JSON.stringify({ bundle: { tenantId: 'layout-fixture', pageId: page.id, title: page.title, route: page.route, routeKey: page.id, status: 'published', isVisible: true, schemaVersion: 1, sections: page.components, aboveTheFold: { navigation: { tabs: content.configuration.navigationTabs }, branding: { ...content.configuration, tenantId: 'layout-fixture' } } } }));
    }
    if (url.pathname === '/public/events') return res.end(JSON.stringify({events: []}));
    if (url.pathname === '/public/teams') return res.end(JSON.stringify({teams: []}));
    if (url.pathname === '/public/runtime') return res.end(JSON.stringify({boardMessages: []}));
    if (url.pathname === '/public/programs') return res.end(JSON.stringify({programs: [{tenantId: 'layout-fixture', programName: 'HuddleWay', logoUrl: ''}]}));
    res.writeHead(404); return res.end('{}');
  }
  let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  if (path === root) path = resolve(root, 'index.html');
  try {
    let bytes = await readFile(path);
    if (process.env.DEBUG_CONSUMER_CONSOLE === '1' && path.endsWith('/index.html')) {
      bytes = Buffer.from(bytes.toString().replace('<head>', `<head><script>
        for (const level of ['log','warn','error']) { const original = console[level].bind(console); console[level] = (...args) => {
          original(...args); const message = args.map(x => String(x)).join(' ');
          if (/Error|Exception|inherit|GlobalKey|\\u2500|\\u2550/.test(message)) fetch('/__console', {method:'POST',headers:{'Content-Type':'text/plain'},body:message.slice(0,16000)}).catch(() => {});
        }; }
      </script>`));
    }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(8893, '127.0.0.1', () => console.log('Real consumer app: http://127.0.0.1:8893 (sample public data only)'));
