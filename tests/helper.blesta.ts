import { Locator, Page, expect } from '@playwright/test';
import { runDatabaseQuery } from './helper.stack';

export async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login/');

  await page.locator('input[name="username"]').fill('admin');
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Log In' }).click();

  await page.waitForURL('**/admin/');
}

export async function handleModalPrompt(page: Page, button: string = 'Yes'): Promise<void> {
  const modalElement = await page.locator('.qtip-modal');
  await expect(modalElement).toBeVisible();

  await modalElement.getByRole('link', { name: button }).click();
  await page.waitForLoadState('domcontentloaded');
}

export async function expectAdminMessage(page: Page, message: string): Promise<void> {
  const parentElement = await page.locator('.error_section').locator('visible=true');
  const messageElement = await parentElement.getByText(message);

  await expect(messageElement).toBeVisible();
}

export async function deleteAdminTableItems(page: Page, locator: Locator): Promise<void> {
  for (let i = 0; i < 50; i++) {
    // Bail out once no delete links are left
    const deleteLinks = await locator.getByRole('link', { name: 'Delete' }).all();
    if (deleteLinks.length === 0) {
      return;
    }

    // Click first delete link and confirm modal
    await deleteLinks[0].click();
    await handleModalPrompt(page);

    // Ensure department was removed
    await expectAdminMessage(page, 'was successfully deleted');
  }

  throw new Error('Failed to remove all items');
}

export function getFieldsetByTitle(page: Page, title: string): Locator {
  return page.locator('section.fieldset').getByRole('heading', { name: title }).locator('..');
}

export async function runManualCron(page: Page): Promise<void> {
  // Remove previous cron runs to schedule immediate execution
  await runDatabaseQuery('DELETE FROM log_cron');

  // Trigger manual cron execution
  await page.goto('/cron/?cron_key=');

  // Wait for cron execution to complete
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('xpath=//html/body')).toContainText('All system tasks have been completed.');
}
