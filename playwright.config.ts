import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'blesta-setup',
      testDir: './tests/blesta-setup',
    },
    {
      name: 'blesta-admin',
      testDir: './tests/blesta-admin',
      dependencies: ['blesta-setup'],
    },
  ],
});
