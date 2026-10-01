import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `globals: false` in vitest.config.ts means RTL's automatic afterEach(cleanup)
// registration (which only fires when it detects global test-framework hooks)
// never engages, so it's registered explicitly here — otherwise DOM from one
// test leaks into the next `render()` within the same file.
afterEach(() => {
  cleanup();
});
