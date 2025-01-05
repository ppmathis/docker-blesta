import { Page, test } from '@playwright/test';
import { deleteAdminTableItems, expectAdminMessage, loginAdmin } from '../helper.blesta';

test.describe('Packages > Order Forms', () => {
  test.beforeAll('cleanup', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await removeAllOrderForms(page);
  });

  test('should create basic http order form', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/plugin/order/admin_forms/add/');

    await page.getByRole('textbox', { name: 'Name' }).fill('Basic - HTTP');
    await page.getByRole('textbox', { name: 'Label' }).fill('basic-http');

    await page.getByRole('button', { name: 'Add Form' }).click();
    await expectAdminMessage(page, 'The form was successfully added.');
  });

  test('should create basic https order form', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/plugin/order/admin_forms/add/');

    await page.getByRole('textbox', { name: 'Name' }).fill('Basic - HTTPS');
    await page.getByRole('textbox', { name: 'Label' }).fill('basic-https');
    await page.getByRole('checkbox', { name: 'Force Secure Connection (HTTPS)' }).check();

    await page.getByRole('button', { name: 'Add Form' }).click();
    await expectAdminMessage(page, 'The form was successfully added.');
  });

  async function removeAllOrderForms(page: Page): Promise<void> {
    await page.goto('/admin/plugin/order/admin_forms/');
    await deleteAdminTableItems(page, page.locator('#admin_forms table'));
  }
});
