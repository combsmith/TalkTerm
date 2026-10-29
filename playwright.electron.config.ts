import { defineConfig } from '@playwright/test';

/**
 * Playwright config for Electron E2E tests.
 * Tests launch Electron directly via _electron.launch() — no webServer needed.
 * Requires: npx electron-forge make (or npm run dev with .vite/build/main.js present)
 */
export default defineConfig({
  testDir: './test/e2e',
  testIgnore:
    process.env['CI'] === 'true'
      ? [
          '**/electron-app.spec.ts',
          '**/conversation-patterns.spec.ts',
          '**/structured-questions.spec.ts',
        ]
      : [],
  timeout: 120_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx vite --config vite.renderer.config.ts --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  workers: 1, // Serial — Electron tests share app state
});
