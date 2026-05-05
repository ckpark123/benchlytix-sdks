/**
 * Local vitest config for `benchlytix-mcp-server` — isolates the package
 * from the parent monorepo's root vitest.config.ts which references
 * jsdom setup files that don't exist at this nesting level.
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
})
