import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';
import adminStyles from './scripts/consolidate-admin-styles.mjs';

export default defineConfig({
  site: 'https://huddleway.com',
  output: 'static',
  // The development toolbar covers bottom navigation on phone viewports.
  // Keep it available for normal development, but exclude it from UI journeys.
  devToolbar: { enabled: process.env.PLAYWRIGHT_ISOLATED_ADMIN !== '1' },
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
    build: {
      minify: 'terser',
      cssMinify: 'lightningcss',
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
