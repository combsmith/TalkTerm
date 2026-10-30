import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000,
    include: ['src/**/*.test.{ts,tsx}', 'test/integration/**/*.test.ts'],
    setupFiles: ['./test/setup-renderer.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
      exclude: [
        'node_modules/',
        'src/main/main.ts',
        'src/preload/preload.ts',
        'src/renderer/renderer.tsx',
        'src/shared/types/ports/',
        'src/shared/types/domain/agent-event.ts',
        'src/shared/types/domain/api-key-state.ts',
        'src/shared/types/domain/electron-api.ts',
        'src/main/ipc/ipc-registrar.ts',
        'test/',
        '**/*.config.*',
        '**/*.d.ts',
        '.vite/',
        'out/',
      ],
    },
  },
});
