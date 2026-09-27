import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', root: 'packages/shared', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'server', root: 'apps/server', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'mgx-mock', root: 'apps/mgx-mock', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'scene', root: 'packages/scene', include: ['test/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'web', root: 'apps/web', include: ['test/**/*.test.ts'], environment: 'node' } },
    ],
  },
})
