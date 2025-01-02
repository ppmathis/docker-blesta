import test from '@playwright/test';
import { runComposeE2E } from '../helper.stack';

test('ensure e2e stack is running', async ({}) => {
  test.setTimeout(120_000);

  // Skip if running in CI, as 02-setup-wizard.spec.ts will handle stack setup
  if (!process.env.CI) {
    await runComposeE2E(['up', '--detach', '--no-recreate']);
  }
});
