import { Page, test, expect } from '@playwright/test';
import { deleteAdminTableItems, expectAdminMessage, loginAdmin, runManualCron } from '../helper.blesta';
import { deleteAllMails, expectMail, sendFakeMail } from '../helper.mailpit';
import { runDatabaseQuery } from '../helper.stack';
import { api, createApi } from '../helper.api';

test.describe('Support > Departments', () => {
  test.beforeAll('configure support and cleanup', async ({ browser, playwright }) => {
    const context = await createApi(playwright);
    try {
      // localhost is not a valid sender domain, so plugin installation omits this template.
      const action = 'SupportManager.ticket_updated';
      const existing = await api(context, 'emails', 'getByType', { company_id: 1, action, lang: 'en_us' });
      if (!existing) {
        const group = await api(context, 'email_groups', 'getByAction', { action });
        await api(context, 'emails', 'add', { vars: {
          company_id: 1, email_group_id: group.id, lang: 'en_us', from: 'support@example.com', from_name: 'Support',
          subject: 'Update to Ticket {ticket_hash_code}', text: '{ticket.details}', html: '<p>{ticket.details_html}</p>',
        } });
      }
    } finally { await context.dispose(); }
    const page = await browser.newPage();
    try {
      await loginAdmin(page);
      await removeAllDepartments(page);
      await removeAllTickets(page);
    } finally { await page.close(); }
  });

  test('should create a new department', async ({ page }) => {
    await loginAdmin(page);
    await removeAllDepartments(page);

    await page.goto('/admin/plugin/support_manager/admin_departments/add/');
    await page.getByRole('textbox', { name: 'Name' }).fill('Support');
    await setDepartmentDescription(page, 'Support Department');
    await page.getByRole('checkbox', { name: 'Allow only clients to open or reply to tickets' }).uncheck();
    await page.getByRole('textbox', { name: 'Email' }).fill('support@example.com');
    await page.locator('#override_from_email').check();
    await page.getByRole('checkbox', { name: 'Automatically transition ticket status on admin reply' }).uncheck();
    await page.getByRole('combobox', { name: 'Default Priority' }).selectOption('Medium');

    const legacyEmailHandling = page.getByRole('combobox', { name: 'Email Handling' });
    if (await legacyEmailHandling.isVisible().catch(() => false)) {
      await legacyEmailHandling.selectOption('POP3');
    } else {
      await page.locator('label[for="method_pop3"]').click();
    }
    await page.locator('select[name="mark_messages"]:visible').selectOption('Deleted');
    await page.locator('input[name="host"]:visible').fill('mailpit.local');
    await page.locator('input[name="user"]:visible').fill('blesta');
    await page.locator('input[name="pass"]:visible').fill('blesta');
    await page.locator('input[name="port"]:visible').fill('1110');

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
      'This is a test ticket via email',
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
    await page.getByRole('row').filter({ hasText: 'Test Ticket via Mail' }).getByRole('link').first().click();

    await page.waitForURL(/admin_tickets\/reply\//);
    const ticketUrl = page.url();

    // Write dummy text for ticket reply
    await setTicketReply(page, 'This reply contains an attachment');

    // Attach a file to the ticket reply
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Drop files here to upload or Click to select files', { exact: false }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('tests/fixtures/hello-world.txt');

    // Legacy Dropzone retains dz-processing after success; Blesta 6 stages files until submit.
    const dzPreview = page.locator('.dz-preview').filter({ hasText: 'hello-world.txt' });
    if ((await page.locator('#ticketFileInput').count()) === 0) {
      await expect(dzPreview).toHaveClass(/dz-success/);
    } else {
      await expect(page.getByText('hello-world.txt', { exact: true })).toBeVisible();
      expect(await page.locator('#ticketFileInput').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(1);
    }

    // Submit to update ticket
    await page.getByRole('button', { name: 'Update Ticket' }).click();
    await expect(page.getByText('has been successfully updated', { exact: false })).toBeVisible();
    const replies = await runDatabaseQuery('SELECT type, details FROM support_replies WHERE details LIKE ?', ['%This reply contains an attachment%']);
    expect(replies).toHaveLength(1);
    expect(replies[0].type).toBe('reply');
    await expectMail('support@example.com', 'client@example.com', /Update to Ticket/);
    await deleteAllMails();
    await page.goto(ticketUrl);
    const downloadLink = page.getByRole('link', { name: 'hello-world.txt' }).first();
    await expect(downloadLink).toBeVisible();
    const attachment = await page.request.get((await downloadLink.getAttribute('href'))!);
    expect(attachment.status()).toBe(200);
    expect((await attachment.body()).toString()).toContain('Hello World!');
    await page.goto('/admin/plugin/support_manager/admin_tickets/index/open');
    await page.locator('input[name="tickets[]"][value="all"]').click();
    await page.locator('select#ticket_action').selectOption('Update Status');
    await page.locator('select[name="status"]').selectOption('Closed');
    await page.locator('#ticket_actions input[type="submit"]').click();
    await page.goto('/admin/plugin/support_manager/admin_tickets/index/closed');
    await expect(page.getByText('Test Ticket via Mail')).toBeVisible();
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
    await deleteAdminTableItems(page, page.locator('table#departments'));
  }

  async function setDepartmentDescription(page: Page, value: string): Promise<void> {
    const label = page.locator('label[for="description"]');
    const oldTextArea = page.locator('#description');
    const newEditor = label.locator('..').locator('[contenteditable="true"]').first();

    if (await oldTextArea.isVisible().catch(() => false)) {
      await oldTextArea.fill(value);
      return;
    }

    await newEditor.click();
    await newEditor.fill(value);
  }

  async function setTicketReply(page: Page, value: string): Promise<void> {
    const oldTextArea = page.locator('textarea[name="details"]');
    const newEditor = page
      .locator('#reply_details')
      .locator('..')
      .locator('[contenteditable="true"]:visible')
      .first();

    await Promise.race([
      oldTextArea.waitFor({ state: 'attached' }).catch(() => {}),
      newEditor.waitFor({ state: 'attached' }).catch(() => {}),
    ]);

    if (await oldTextArea.isVisible().catch(() => false)) {
      await oldTextArea.fill(value);
      return;
    }

    await newEditor.click();
    await newEditor.fill(value);
  }
});
