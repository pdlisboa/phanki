import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'node', environment: 'node', include: ['packages/*/test/**/*.test.ts', 'apps/server/test/**/*.test.ts'] },
      },
      {
        resolve: { alias: { '@': path.resolve(import.meta.dirname, 'apps/web/src') } },
        define: { __APP_VERSION__: '"test"' },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/test/**/*.test.ts'],
          setupFiles: ['apps/web/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // Logic layers. React pages/components are exercised by the integration and manual tests.
      include: ['packages/shared/src/**', 'apps/server/src/**', 'apps/web/src/lib/**'],
      exclude: ['apps/server/src/index.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
})
