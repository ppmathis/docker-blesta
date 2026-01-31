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
    await page.getByRole('checkbox', { name: 'My installation is behind a proxy or load balancer' }).check();

    await page.getByRole('button', { name: 'Update Settings' }).click();
    await expectAdminMessage(page, 'The Basic Setup settings were successfully updated!');

    const isValid = async (name: string) => {
      const inputElement = page.getByRole('textbox', { name });
      const iconElement = inputElement.locator('xpath=following-sibling::i');
      await expect(iconElement).toBeVisible();
      await expect(iconElement).toHaveClass(/fa-check/);
    };

    await isValid('Root Web Directory');
    await isValid('Temp Directory');
    await isValid('Uploads Directory');
    await isValid('Log Directory');
  });
});
