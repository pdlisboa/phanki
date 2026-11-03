import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Builds the production Docker image once and runs the suites against real containers.
export default defineConfig({
  test: {
    globalSetup: ['test/integration/global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 900_000,
    fileParallelism: false,
    projects: [
      { extends: true, test: { name: 'container', environment: 'node', include: ['test/integration/**/*.container.test.ts'] } },
      {
        extends: true,
        resolve: { alias: { '@': path.resolve(import.meta.dirname, 'apps/web/src') } },
        define: { __APP_VERSION__: '"test"' },
        test: { name: 'client', environment: 'jsdom', include: ['test/integration/**/*.client.test.ts'], setupFiles: ['apps/web/test/setup.ts'] },
      },
    ],
  },
})
