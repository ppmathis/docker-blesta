import test, { expect, type BrowserContext } from '@playwright/test';
import { composeOutput, runComposeE2E, runDatabaseQuery, waitForDatabase } from '../helper.stack';

let installerCookies: Parameters<BrowserContext['addCookies']>[0] = [];

test.describe('Initial Setup', () => {
  test.describe.configure({
    mode: 'serial',
    timeout: 120_000,
  });

  test.beforeAll('reset e2e stack', async ({}) => {
    test.setTimeout(120_000);

    if (!process.env.BLESTA_LICENSE_KEY) throw new Error('BLESTA_LICENSE_KEY is required for licensed validation');

    // Restart E2E compose stack for clean state
    await runComposeE2E(['down', '-v']);
    await runComposeE2E(['up', '--detach', '--wait', '--remove-orphans', '--renew-anon-volumes']);

    // Wait for database to be ready
    await waitForDatabase();
    const imageVersion = (await composeOutput(['exec', '-T', 'blesta', 'printenv', 'BLESTA_VERSION'])).trim();
    const phpVersion = (await composeOutput(['exec', '-T', 'blesta', 'php', '-r', 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;'])).trim();
    const imagePhp = (await composeOutput(['exec', '-T', 'blesta', 'printenv', 'PHP_VERSION'])).trim();
    expect(imageVersion).toBe(process.env.BLESTA_EXPECTED_VERSION ?? imageVersion);
    expect(phpVersion).toBe(process.env.BLESTA_EXPECTED_PHP ?? imagePhp);
    const architecture = (await composeOutput(['exec', '-T', 'blesta', 'uname', '-m'])).trim();
    if (process.env.BLESTA_PLATFORM) expect(architecture).toBe(process.env.BLESTA_PLATFORM === 'linux/amd64' ? 'x86_64' : 'aarch64');
    await expect.poll(async () => {
      try { return (await fetch('http://localhost:4200')).status; } catch { return 0; }
    }, { timeout: 120_000 }).toBe(200);
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
    installerCookies = await page.context().cookies();
  });

  test('should complete system setup', async ({ browser }) => {
    // A separately managed context prevents license values appearing in failure snapshots.
    const context = await browser.newContext({ baseURL: 'http://localhost:4200' });
    const page = await context.newPage();
    try {
      await page.context().addCookies(installerCookies);
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

      // A successful setup redirects to the admin dashboard. Blesta 6 displays
      // the license type in a regular alert, so alert count is not an error signal.
      await page.waitForURL('**/admin/', { timeout: 60000 });
      await expect(page).toHaveURL(/\/admin\/$/);
    } finally { await context.close(); }
  });

  test('uses the configured test hostname', async ({}) => {
    await runDatabaseQuery('UPDATE companies SET hostname = "localhost" WHERE id = 1');
  });
});
