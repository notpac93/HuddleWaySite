import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://huddleway.com',
  output: 'static',
  // Static hosting serves directory artifacts with trailing slashes while
  // application links omit them. Accept both so bookmarks and provider return
  // links cannot strand a user on Astro's development/static 404 page.
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
    build: {
      minify: 'terser',
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
          codeSplitting: {
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
