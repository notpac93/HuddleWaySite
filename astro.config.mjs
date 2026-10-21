import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import adminStyles from './scripts/consolidate-admin-styles.mjs';
import { crmCssTarget, crmCssTargets } from './scripts/crm-css-compatibility.mjs';

export default defineConfig({
  site: 'https://huddleway.com',
  output: 'static',
  // The development toolbar covers bottom navigation on phone viewports.
  // Keep it available for normal development, but exclude it from UI journeys.
  devToolbar: {
    enabled: process.env.PLAYWRIGHT_TEST !== '1'
      && process.env.PLAYWRIGHT_ISOLATED_ADMIN !== '1',
  },
  // Static hosting serves directory artifacts with trailing slashes while
  // application links omit them. Accept both so bookmarks and provider return
  // links cannot strand a user on Astro's development/static 404 page.
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  integrations: [svelte(), adminStyles()],
  vite: {
    cacheDir: process.env.PLAYWRIGHT_ISOLATED_ADMIN === '1'
      ? '.astro/admin-ui-vite'
      : undefined,
    plugins: [tailwindcss()],
    css: { lightningcss: { targets: crmCssTargets } },
    build: {
      minify: 'terser',
      cssMinify: 'lightningcss',
      // Preserve the native app's iOS 15.5 minimum, including media-query syntax.
      cssTarget: crmCssTarget,
      terserOptions: {
        compress: {
          passes: 3,
        },
        format: {
          comments: false,
        },
      },
      rolldownOptions: {
        output: {
          // Firebase has eager initializers across size-split chunks. Keep their
          // original execution order so hydration cannot read uninitialized classes.
          strictExecutionOrder: true,
          codeSplitting: {
            minSize: 30_000,
            groups: [
              {
                name: 'firebase',
                test: /node_modules[\\/](?:@firebase|firebase)[\\/]/,
                maxSize: 240_000,
                entriesAware: true,
              },
            ],
          },
        },
      },
    },
  },
});
