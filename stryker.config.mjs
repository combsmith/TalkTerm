/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: [
    'src/shared/types/domain/**/*.ts',
    'src/main/agent/**/*.ts',
    'src/main/storage/**/*.ts',
    'src/main/security/**/*.ts',
    'src/main/ipc/**/*.ts',
    'src/renderer/hooks/**/*.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/shared/types/domain/question-parser.ts',
    '!src/shared/types/domain/render-markdown.ts',
    '!src/main/agent/claude-sdk-backend.ts',
    '!src/main/ipc/ipc-registrar.ts',
    '!src/main/ipc/speech-ipc-handler.ts',
    '!src/**/*.d.ts',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  ignorePatterns: ['out', '.vite', '.stryker-tmp', 'node_modules'],
  thresholds: {
    high: 90,
    low: 80,
    break: 80,
  },
  vitest: {
    configFile: 'vitest.config.ts',
  },
};
