/**
 * Local vitest config for `@benchlytixai/sdk` — isolates the package from
 * the parent monorepo's root vitest.config.ts which references jsdom
 * setup files that don't exist at this nesting level.
 *
 * Pure-Node tests; the SDK has no DOM dependencies (uses `fetch`).
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Inline (empty) PostCSS config: without it Vite searches upward and loads the
  // repo root's postcss.config.js, which needs tailwindcss, a dependency this
  // package does not install (CI runs `npm ci` per package).
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
})
