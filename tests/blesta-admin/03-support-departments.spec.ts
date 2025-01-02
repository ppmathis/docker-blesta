import { Page, test, expect } from '@playwright/test';
import { expectAdminMessage, handleModalPrompt, loginAdmin, runManualCron } from '../helper.blesta';
import { deleteAllMails, sendFakeMail } from '../helper.mailpit';

test.describe('Support > Departments', () => {
  test.afterAll('cleanup', async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await removeAllDepartments(page);
    await removeAllTickets(page);
  });

  test('should create a new department', async ({ page }) => {
    await loginAdmin(page);
    await removeAllDepartments(page);

    await page.goto('/admin/plugin/support_manager/admin_departments/add/');
    await page.getByRole('textbox', { name: 'Name' }).fill('Support');
    await page.getByRole('textbox', { name: 'Description' }).fill('Support Department');
    await page.getByRole('checkbox', { name: 'Allow only clients to open or reply to tickets' }).uncheck();
    await page.getByRole('textbox', { name: 'Email' }).fill('support@example.com');
    await page.getByRole('checkbox', { name: 'Automatically transition ticket status on admin reply' }).uncheck();
    await page.getByRole('combobox', { name: 'Default Priority' }).selectOption('Medium');

    await page.getByRole('combobox', { name: 'Email Handling' }).selectOption('POP3');
    await page.getByRole('combobox', { name: 'Mark Messages as' }).selectOption('Deleted');
    await page.getByRole('textbox', { name: 'Host' }).fill('mailpit.local');
    await page.getByRole('textbox', { name: 'User' }).fill('blesta');
    await page.getByRole('textbox', { name: 'Pass' }).fill('blesta');
    await page.getByRole('textbox', { name: 'Port' }).fill('1110');

    await page.getByRole('button', { name: 'Add Department' }).click();
    await expectAdminMessage(page, 'The Support department was successfully created.');
  });

  test('should fetch support email', async ({ page }) => {
    await loginAdmin(page);

    // Remove all existing tickets
    await removeAllTickets(page);

    // Delete all existing emails and send a new one
    await deleteAllMails();
    await sendFakeMail(
      'client@example.com',
      'support@example.com',
      'Test Ticket via Mail',
      'This is a test ticket via email'
    );

    // Run manual cron to fetch emails
    await runManualCron(page);
    await deleteAllMails();

    // Ensure ticket was created
    await page.goto('/admin/plugin/support_manager/admin_tickets/index/open');
    await expect(page.getByText('Test Ticket via Mail')).toBeVisible();
  });

  test('should handle attachments in tickets', async ({ page }) => {
    await loginAdmin(page);

    // Navigate to first open ticket from previous test
    await page.goto('/admin/plugin/support_manager/admin_tickets/index/open');
    await page.locator('table#ticket_list tr > td > a').first().click();

    // Write dummy text for ticket reply
    await page.locator('textarea[name="details"]').fill('This reply contains an attachment');

    // Attach a file to the ticket reply
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drop files here to upload or Click to select files', { exact: false }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('tests/fixtures/hello-world.txt');

    // Wait for dropzone file upload to complete
    const dzElement = page
      .locator('.dz-preview > .dz-details > .dz-filename:has-text("hello-world.txt")')
      .locator('..');
    await expect(dzElement).not.toHaveClass(/dz-processing/);

    // Submit to update ticket
    await page.getByRole('button', { name: 'Update Ticket' }).click();
    await deleteAllMails();
  });

  async function removeAllTickets(page: Page): Promise<void> {
    await page.goto('/admin/plugin/support_manager/admin_tickets/index/open');

    for (let i = 0; i < 50; i++) {
      // Bail out once no tickets are left
      const emptyCount = await page.getByText('There are currently no tickets with this status.').count();
      if (emptyCount > 0) {
        return;
      }

      // Search for checkbox to select all tickets
      await page.locator('input[type="checkbox"][name="tickets[]"][value="all"]').click();

      // Execute mass-action to trash tickets
      const actionBoxElement = page.locator('div#ticket_actions');
      await actionBoxElement.locator('select#ticket_action').selectOption('Update Status');
      await actionBoxElement.locator('select[name="status"]').selectOption('Trash');
      await actionBoxElement.locator('input[type="submit"]').click();
    }

    throw new Error('Failed to remove all tickets');
  }

  async function removeAllDepartments(page: Page): Promise<void> {
    await page.goto('/admin/plugin/support_manager/admin_departments/');

    for (let i = 0; i < 50; i++) {
      // Find table element containing departments
      const tableElement = await page.locator('#departments');

      // Bail out once no delete links are left
      const deleteLinks = await tableElement.getByRole('link', { name: 'Delete' }).all();
      if (deleteLinks.length === 0) {
        return;
      }

      // Click first delete link and confirm modal
      await deleteLinks[0].click();
      await handleModalPrompt(page);

      // Ensure department was removed
      await expectAdminMessage(page, 'department was successfully deleted');
    }

    throw new Error('Failed to remove all departments');
  }
});
