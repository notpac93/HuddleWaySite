import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const distDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('dist');
const requiredPages = ['index', 'features', 'savings', 'setup-faq', 'support', 'privacy', 'terms'];
const htmlPages = ['index', 'support', 'privacy', 'terms'];
const privateHtmlPages = ['admin/index', 'admin/setup/index'];
const requiredFiles = [
  '.well-known/security.txt',
  'robots.txt',
  'sitemap.xml',
];

const htmlChecks = [
  {
    label: 'page-level CSP meta',
    matcher: /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content=["'][^"']*default-src/i,
  },
  {
    label: 'referrer meta',
    matcher: /<meta[^>]+name=["']referrer["'][^>]+content=["']strict-origin-when-cross-origin["']/i,
  },
  {
    label: 'canonical link',
    matcher: /<link[^>]+rel=["']canonical["']/i,
  },
  {
    label: 'robots meta',
    matcher: /<meta[^>]+name=["']robots["'][^>]+content=["']index, follow["']/i,
  },
];

let failures = 0;

const pageCandidates = (page) => {
  if (page === 'index') {
    return ['index.html'];
  }

  return [`${page}.html`, `${page}/index.html`];
};

const readFirstExisting = async (relativePaths) => {
  for (const relativePath of relativePaths) {
    try {
      return {
        relativePath,
        html: await readFile(path.join(distDir, relativePath), 'utf8'),
      };
    } catch {
      // Try the next supported static route shape.
    }
  }

  return null;
};

for (const page of requiredPages) {
  const result = await readFirstExisting(pageCandidates(page));

  if (!result) {
    failures += 1;
    console.error(`FAIL missing built page: ${page}`);
  }
}

for (const relativePath of requiredFiles) {
  const filePath = path.join(distDir, relativePath);

  try {
    await readFile(filePath);
  } catch {
    failures += 1;
    console.error(`FAIL missing built file: ${relativePath}`);
  }
}

for (const page of htmlPages) {
  const result = await readFirstExisting(pageCandidates(page));

  if (!result) {
    continue;
  }

  for (const check of htmlChecks) {
    if (!check.matcher.test(result.html)) {
      failures += 1;
      console.error(`FAIL ${result.relativePath} missing ${check.label}`);
    }
  }
}

for (const page of privateHtmlPages) {
  const result = await readFirstExisting(pageCandidates(page));
  if (!result) {
    failures += 1;
    console.error(`FAIL missing built private page: ${page}`);
    continue;
  }
  for (const check of htmlChecks.slice(0, 2)) {
    if (!check.matcher.test(result.html)) {
      failures += 1;
      console.error(`FAIL ${result.relativePath} missing ${check.label}`);
    }
  }
  if (!/<meta[^>]+name=["']robots["'][^>]+content=["']noindex,\s*nofollow["']/i.test(result.html)) {
    failures += 1;
    console.error(`FAIL ${result.relativePath} missing private robots policy`);
  }
}

const securityText = await readFile(path.join(distDir, '.well-known/security.txt'), 'utf8');

for (const requiredField of ['Contact:', 'Canonical:', 'Policy:']) {
  if (!securityText.includes(requiredField)) {
    failures += 1;
    console.error(`FAIL .well-known/security.txt missing ${requiredField}`);
  }
}

const robots = await readFile(path.join(distDir, 'robots.txt'), 'utf8');

if (!/Sitemap:\s+https:\/\/huddleway\.com\/sitemap\.xml/i.test(robots)) {
  failures += 1;
  console.error('FAIL robots.txt missing canonical sitemap reference');
}

if (failures > 0) {
  process.exitCode = 1;
  console.error(`Static security check failed with ${failures} issue${failures === 1 ? '' : 's'}.`);
} else {
  console.log('Static security check passed.');
}
