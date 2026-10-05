import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) {
  loadEnvFile('.env');
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  globalTeardown: './tests/teardown.ts',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['./tests/reporter.ts'], ['line'], ['html', { open: 'never', outputFolder: process.env.PLAYWRIGHT_REPORT_DIR ?? 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    ignoreHTTPSErrors: true,
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'blesta-core', testDir: './tests/blesta-core', dependencies: ['blesta-guest'] },
    {
      name: 'blesta-setup',
      testDir: './tests/blesta-setup',
    },
    {
      name: 'blesta-admin',
      testDir: './tests/blesta-admin',
      dependencies: ['blesta-setup'],
    },
    {
      name: 'blesta-guest',
      testDir: './tests/blesta-guest',
      dependencies: ['blesta-admin'],
    },
  ],
});
