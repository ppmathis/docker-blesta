import { Locator, Page, expect } from '@playwright/test';
import { runDatabaseQuery } from './helper.stack';

export async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login/');

  await page.locator('input[name="username"]').fill('admin');
  await page.locator('input[name="password"]').fill('password');
  await page.getByRole('button', { name: 'Log In' }).click();

  await page.waitForURL('**/admin/');
  // Dashboard widgets also write session state; finish them before step-up authentication.
  await page.waitForLoadState('networkidle');
}

export async function handleAccessVerification(page: Page): Promise<boolean> {
  const heading = await page.getByRole('heading', { name: /Access Verification/ });
  const present = await heading.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
  if (!present) return false;

  await page.getByRole('textbox', { name: 'password' }).fill('password');
  await page.getByRole('button', { name: 'Verify Access' }).click();
  await expect(heading).toBeHidden();
  await page.waitForLoadState('networkidle');

  return true;
}

export async function handleModalPrompt(page: Page, button: string = 'Yes'): Promise<void> {
  const legacyModal = page.locator('.qtip-modal:visible').last();
  if (await legacyModal.isVisible().catch(() => false)) {
    await legacyModal.getByRole('link', { name: button, exact: true }).click();
  } else {
    const modernModal = page.locator('.modal.show').last();
    await expect(modernModal).toBeVisible();
    const modernButton = button === 'Yes' ? /^(?:Yes|Delete|Please Confirm)$/ : new RegExp(`^${button}$`);
    await modernModal.getByRole('button', { name: modernButton }).click();
    await expect(modernModal).toBeHidden();
  }

  await page.waitForLoadState('domcontentloaded');
}

export async function expectAdminMessage(page: Page, message: string): Promise<void> {
  await expect(page.getByText(message, { exact: false }).filter({ visible: true })).toBeVisible();
}

export async function deleteAdminTableItems(page: Page, locator: Locator): Promise<void> {
  for (let i = 0; i < 50; i++) {
    // Bail out once no delete links are left
    const deleteActions = locator
      .getByRole('link', { name: 'Delete', exact: true })
      .or(locator.getByTitle('Delete'))
      .filter({ visible: true });
    const deleteActionCount = await deleteActions.count();
    if (deleteActionCount === 0) {
      return;
    }

    // Click first delete action and confirm modal
    await deleteActions.first().click({ noWaitAfter: true });
    await handleModalPrompt(page);
    await expect(deleteActions).toHaveCount(deleteActionCount - 1);

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
