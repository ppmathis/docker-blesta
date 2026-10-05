import { expect, test } from '@playwright/test';
import { expectAdminMessage, handleAccessVerification, loginAdmin } from '../helper.blesta';
import { deleteAllMails, expectMail } from '../helper.mailpit';

test.describe('Company > Emails', () => {
  test('should manage mail settings', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/settings/company/emails/mail/');
    await handleAccessVerification(page);

    await page.getByRole('combobox', { name: 'Delivery Method' }).selectOption('SMTP');
    await page.getByRole('textbox', { name: 'SMTP Host' }).fill('mailpit');
    await page.getByRole('textbox', { name: 'SMTP Port' }).fill('1025');
    await page.locator('input[name="smtp_user"]').clear();
    await page.locator('input[name="smtp_password"]').clear();

    await page.getByRole('button', { name: 'Update Settings' }).click();
    await expectAdminMessage(page, 'The Mail settings have been successfully updated!');

    await page.getByRole('textbox', { name: 'Test From Address' }).fill('billing@example.com');
    await page.getByRole('textbox', { name: 'Test To Address' }).fill('admin@example.com');

    await deleteAllMails();
    await page
      .getByRole('link', { name: 'Test These Settings' })
      .or(page.getByRole('button', { name: 'Test These Settings' }))
      .click();
    await expect.poll(async () =>
      (await page.getByRole('heading', { name: /Access Verification/ }).isVisible()) ||
      (await page.getByText('SMTP connection was successful!', { exact: false }).filter({ visible: true }).isVisible())
    ).toBe(true);
    if (await handleAccessVerification(page)) {
      await page.goto('/admin/settings/company/emails/mail/');
      await page.getByRole('textbox', { name: 'Test From Address' }).fill('billing@example.com');
      await page.getByRole('textbox', { name: 'Test To Address' }).fill('admin@example.com');
      await page.getByRole('link', { name: 'Test These Settings' }).or(page.getByRole('button', { name: 'Test These Settings' })).click();
    }
    await expectAdminMessage(page, 'SMTP connection was successful!');
    await expectMail('billing@example.com', 'admin@example.com', 'SMTP connection was successful!');
  });
});

test.describe('Company > Look and Feel', () => {
  test('should upload a PNG logo (issue #4)', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/settings/company/lookandfeel/customize/');
    await handleAccessVerification(page);

    await page.locator('#admin_logo').setInputFiles('assets/blesta-logo-color.png');
    await page.getByRole('button', { name: 'Save' }).click();

    const successMessage = page
      .getByText('The custom logo was successfully updated.', { exact: false })
      .filter({ visible: true });
    if (await successMessage.isVisible().catch(() => false)) {
      await expect(successMessage).toBeVisible();
    } else {
      await expect(page.getByRole('img', { name: 'Logo' }).first()).toHaveAttribute('src', /admin_logo\.png/);
    }
  });
});
