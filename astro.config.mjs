import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://huddleway.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
});
