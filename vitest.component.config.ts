import { svelteTesting } from '@testing-library/svelte/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: {
    name: 'component',
    environment: 'jsdom',
    include: ['tests/component/**/*.test.ts'],
    setupFiles: ['tests/setup/component.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
