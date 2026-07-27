import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = join(repositoryRoot, 'dist');
const budgetPath = join(
  repositoryRoot,
  'config',
  'crm-performance-budgets.json',
);
const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));
const adminHtmlPath = join(distRoot, 'admin', 'index.html');
const adminHtml = readFileSync(adminHtmlPath, 'utf8');

function localAssetPath(url) {
  const normalized = url.startsWith('/') ? url.slice(1) : url;
  return join(distRoot, normalized);
}

function assetSize(url) {
  const bytes = readFileSync(localAssetPath(url));
  return {
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }).length,
  };
}

function addSizes(sizes) {
  return sizes.reduce(
    (total, size) => ({
      raw: total.raw + size.raw,
      gzip: total.gzip + size.gzip,
      brotli: total.brotli + size.brotli,
    }),
    { raw: 0, gzip: 0, brotli: 0 },
  );
}

function staticModuleGraph(rootUrls) {
  const visited = new Set();
  const visit = (url) => {
    if (visited.has(url)) return;
    visited.add(url);
    const source = readFileSync(localAssetPath(url), 'utf8');
    const imports =
      /(?:from\s*|import\s*)["'](\.\/[^"']+\.js)["']/g;
    for (const match of source.matchAll(imports)) {
      visit(posix.join(posix.dirname(url), match[1]));
    }
  };
  rootUrls.forEach(visit);
  return visited;
}

const componentUrls = [
  ...adminHtml.matchAll(
    /(?:component-url|renderer-url)="([^"]+\.js)"/g,
  ),
].map((match) => match[1]);
if (componentUrls.length === 0) {
  throw new Error('The built /admin route has no hydrated CRM component.');
}

const crmEntryUrl = componentUrls.find((url) => /CrmApp\..+\.js$/.test(url));
if (!crmEntryUrl) {
  throw new Error('The built /admin route does not reference the CrmApp entry.');
}

const initialJsGraph = staticModuleGraph(componentUrls);
const initialJs = addSizes([...initialJsGraph].map(assetSize));

const stylesheetUrls = [
  ...adminHtml.matchAll(/rel="stylesheet" href="([^"]+\.css)"/g),
].map((match) => match[1]);
const initialCss = addSizes(stylesheetUrls.map(assetSize));

const faviconUrl =
  adminHtml.match(/rel="icon" href="([^"]+)"/)?.[1] ?? '';
if (!faviconUrl) throw new Error('The built /admin route has no favicon.');
const favicon = assetSize(faviconUrl);

const entrySource = readFileSync(localAssetPath(crmEntryUrl), 'utf8');
const dynamicDependencyUrls = [
  ...entrySource.matchAll(/["'](_astro\/[^"']+\.js)["']/g),
].map((match) => `/${match[1]}`);
const crmJsGraph = staticModuleGraph([
  ...initialJsGraph,
  ...dynamicDependencyUrls,
]);
const totalCrmJs = addSizes([...crmJsGraph].map(assetSize));

const dashboardUrl = `/_astro/${
  readdirSync(join(distRoot, '_astro')).find((file) =>
    /^GlobalDashboard\..+\.js$/.test(file),
  ) ?? ''
}`;
if (dashboardUrl.endsWith('/')) {
  throw new Error('The production build did not create a lazy Dashboard chunk.');
}
const dashboardGraph = staticModuleGraph([dashboardUrl]);
const dashboardAdditionalGraph = new Set(
  [...dashboardGraph].filter((url) => !initialJsGraph.has(url)),
);
const dashboardAdditionalJs = addSizes(
  [...dashboardAdditionalGraph].map(assetSize),
);

const jsAssets = readdirSync(join(distRoot, '_astro'))
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({
    url: `/_astro/${file}`,
    raw: statSync(join(distRoot, '_astro', file)).size,
  }))
  .sort((left, right) => right.raw - left.raw);
const largestJsChunk = jsAssets[0];

const lazyFeaturePrefixes = [
  'ActivityManager',
  'CommunicationsManager',
  'DocumentsManager',
  'EventScheduler',
  'Financials',
  'GlobalDashboard',
  'MediaManager',
  'MyAppStudio',
  'RegistrationManager',
  'RosterManager',
  'SeasonsManager',
  'SettingsManager',
  'StaffManager',
  'TeamsManager',
];
const lazyFeatureChunks = lazyFeaturePrefixes.filter((prefix) =>
  jsAssets.some(({ url }) =>
    new RegExp(`/_astro/${prefix}\\..+\\.js$`).test(url),
  ),
);

const report = {
  route: budgets.route,
  html: { raw: Buffer.byteLength(adminHtml) },
  initialJs: {
    files: initialJsGraph.size,
    ...initialJs,
  },
  initialCss: {
    files: stylesheetUrls.length,
    ...initialCss,
  },
  dashboardAdditionalJs: {
    files: dashboardAdditionalGraph.size,
    ...dashboardAdditionalJs,
  },
  initialNetworkRequests:
    1 + initialJsGraph.size + stylesheetUrls.length + 1,
  largestJsChunk,
  totalCrmJs: {
    files: crmJsGraph.size,
    ...totalCrmJs,
  },
  favicon: {
    url: faviconUrl,
    ...favicon,
  },
  lazyFeatureChunks,
};

const limits = budgets.assetBudgets;
const failures = [];
function check(label, actual, maximum) {
  if (actual > maximum) {
    failures.push(`${label}: ${actual} exceeds ${maximum}`);
  }
}

check('route HTML raw bytes', report.html.raw, limits.maxRouteHtmlRawBytes);
check(
  'initial JS raw bytes',
  report.initialJs.raw,
  limits.maxInitialJsRawBytes,
);
check(
  'initial JS gzip bytes',
  report.initialJs.gzip,
  limits.maxInitialJsGzipBytes,
);
check(
  'initial JS Brotli bytes',
  report.initialJs.brotli,
  limits.maxInitialJsBrotliBytes,
);
check(
  'initial CSS gzip bytes',
  report.initialCss.gzip,
  limits.maxInitialCssGzipBytes,
);
check(
  'initial network requests',
  report.initialNetworkRequests,
  limits.maxInitialNetworkRequests,
);
check(
  'Dashboard additional JS gzip bytes',
  report.dashboardAdditionalJs.gzip,
  limits.maxDashboardAdditionalJsGzipBytes,
);
check(
  'largest JS chunk raw bytes',
  report.largestJsChunk.raw,
  limits.maxLargestJsChunkRawBytes,
);
check(
  'total CRM JS raw bytes',
  report.totalCrmJs.raw,
  limits.maxTotalCrmJsRawBytes,
);
check(
  'CRM favicon raw bytes',
  report.favicon.raw,
  limits.maxCrmFaviconRawBytes,
);
if (report.lazyFeatureChunks.length < limits.minLazyCrmFeatureChunks) {
  failures.push(
    `lazy CRM feature chunks: ${report.lazyFeatureChunks.length} is below `
      + `${limits.minLazyCrmFeatureChunks}`,
  );
}

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) {
  throw new Error(`CRM performance budgets failed:\n- ${failures.join('\n- ')}`);
}
