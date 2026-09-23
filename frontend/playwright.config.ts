import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'uv run --project backend backend', cwd: '..', url: 'http://127.0.0.1:8000/api/health', reuseExistingServer: true },
    { command: 'npm run dev', cwd: '.', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  ],
})
