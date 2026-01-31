import { test } from '@playwright/test';
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
    await page.getByRole('textbox', { name: 'SMTP User' }).clear();
    await page.getByRole('textbox', { name: 'SMTP Password' }).clear();

    await page.getByRole('button', { name: 'Update Settings' }).click();
    await expectAdminMessage(page, 'The Mail settings have been successfully updated!');

    await page.getByRole('textbox', { name: 'Test From Address' }).fill('billing@example.com');
    await page.getByRole('textbox', { name: 'Test To Address' }).fill('admin@example.com');

    await deleteAllMails();
    await page.getByRole('link', { name: 'Test These Settings' }).click();
    await expectAdminMessage(page, 'SMTP connection was successful!');
    await expectMail('billing@example.com', 'admin@example.com', 'SMTP connection was successful!');
  });
});
