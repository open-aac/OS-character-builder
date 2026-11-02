import { defineConfig, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

/** The editor touches the DOM, so its tests run in jsdom instead of the shared node defaults. */
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
    },
  }),
);
