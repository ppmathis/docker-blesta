import { test, expect } from '@playwright/test';
import { expectAdminMessage, handleAccessVerification, loginAdmin } from '../helper.blesta';

test.describe('System > General', () => {
  test('should manage basic setup', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/settings/system/general/basic/');
    await handleAccessVerification(page);

    await expect(page.getByRole('textbox', { name: 'Root Web Directory' })).toHaveValue('/opt/blesta/public/');
    await page.getByRole('textbox', { name: 'Temp Directory' }).fill('/var/tmp/blesta/');
    await page.getByRole('textbox', { name: 'Uploads Directory' }).fill('/opt/blesta/data/uploads/');
    await page.getByRole('textbox', { name: 'Log Directory' }).fill('/opt/blesta/data/logs/');
    const cacheDirectory = page.getByRole('textbox', { name: 'Cache Directory' });
    if (await cacheDirectory.isVisible().catch(() => false)) {
      await cacheDirectory.fill('/opt/blesta/data/cache/');
    }
    await page.getByRole('checkbox', { name: 'My installation is behind a proxy or load balancer' }).check();

    await page.getByRole('button', { name: 'Update Settings' }).click();
    await expectAdminMessage(page, 'The Basic Setup settings were successfully updated!');

    await expect(page.getByRole('textbox', { name: 'Root Web Directory' })).toHaveValue('/opt/blesta/public/');
    await expect(page.getByRole('textbox', { name: 'Temp Directory' })).toHaveValue('/var/tmp/blesta/');
    await expect(page.getByRole('textbox', { name: 'Uploads Directory' })).toHaveValue(
      '/opt/blesta/data/uploads/',
    );
    await expect(page.getByRole('textbox', { name: 'Log Directory' })).toHaveValue('/opt/blesta/data/logs/');
    if (await cacheDirectory.isVisible().catch(() => false)) {
      await expect(cacheDirectory).toHaveValue('/opt/blesta/data/cache/');
    }
  });
});
