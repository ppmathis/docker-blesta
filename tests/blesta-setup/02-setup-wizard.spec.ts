import test, { expect } from '@playwright/test';
import { runComposeE2E, runDatabaseQuery, waitForDatabase } from '../helper.stack';

test.describe('Initial Setup', () => {
  test.describe.configure({
    mode: 'serial',
    timeout: 120_000,
  });

  test.beforeAll('reset e2e stack', async ({}) => {
    test.setTimeout(120_000);

    // Restart E2E compose stack for clean state
    await runComposeE2E(['down', '-v']);
    await runComposeE2E(['up', '--detach', '--remove-orphans', '--renew-anon-volumes']);

    // Wait for database to be ready
    await waitForDatabase();
  });

  test('should complete database setup', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Continue with Installation' }).click();

    await page
      .getByRole('checkbox', {
        name: 'I agree to the terms and conditions',
        exact: false,
      })
      .check();

    await page.locator('input[name="host"]').fill('mariadb');
    await page.locator('input[name="port"]').fill('3306');
    await page.locator('input[name="database"]').fill('blesta');
    await page.locator('input[name="user"]').fill('blesta');
    await page.locator('input[name="password"]').fill('blesta');

    await page.getByRole('button', { name: 'Install' }).click();

    await page.waitForURL('**/admin/login/setup/');
  });

  test('should complete system setup', async ({ page }) => {
    await page.goto('/admin/login/setup/');

    // Fill out license key and disable newsletter
    await page.getByRole('radio', { name: 'I have a license key to enter' }).click();
    await page.locator('input[name="license_key"]').fill(process.env.BLESTA_LICENSE_KEY ?? '');
    await page.getByRole('checkbox', { name: 'Sign-up for our newsletter', exact: false }).uncheck();

    // Fill out initial admin user details
    await page.locator('input[name="first_name"]').fill('Test');
    await page.locator('input[name="last_name"]').fill('Admin');
    await page.locator('input[name="email"]').fill('admin@example.com');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('password');
    await page.locator('input[name="confirm_password"]').fill('password');
    await page.getByRole('button', { name: 'Finish' }).click();

    // Wait for page to load and ensure no alerts are present, otherwise fail-fast
    await page.waitForLoadState('domcontentloaded');
    const alertCount = await page.locator('.alert').count();
    await expect(alertCount).toBe(0);

    // Ensure redirect to admin dashboard after setup
    await expect(page).not.toHaveURL('**/admin/login/setup/');
    await page.waitForURL('**/admin/', { timeout: 60000 });
  });

  test('fix broken company hostname via mysql query', async ({}) => {
    await runDatabaseQuery('UPDATE companies SET hostname = "localhost" WHERE id = 1');
  });
});
