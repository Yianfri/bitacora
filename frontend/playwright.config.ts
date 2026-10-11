import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testIgnore: '**/*.local.*',
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4200',
    browserName: 'chromium',
    ...(process.env['E2E_CHANNEL'] ? { channel: process.env['E2E_CHANNEL'] } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
  },
});
