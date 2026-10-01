import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Section 2 proposed improvement, implemented as listed: zero frontend
 * component tests existed anywhere in this project before this change (no
 * test runner was even configured — see package.json prior to this diff).
 * Kept deliberately minimal: Vitest + React Testing Library, jsdom
 * environment, no additional plugins/matchers beyond jest-dom.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
  },
});
