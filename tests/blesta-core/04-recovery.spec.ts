import { test, expect } from '@playwright/test';
import mysql from 'mysql2/promise';
import { commandBuffer, commandOutput, composeArgs, composeOutput, runComposeE2E, runDatabaseQuery } from '../helper.stack';
import { loginAdmin } from '../helper.blesta';

const restoreArgs = ['compose', '-p', 'blesta-restore', '-f', 'compose.test.yaml', '-f', 'compose.recovery.yaml'];
const restore = (args: string[], input?: Buffer) => commandBuffer('docker', [...restoreArgs, ...args], input);

test('restores a consistent database and data-volume backup into an isolated stack', async ({ browser }) => {
  test.setTimeout(240_000);
  const image = process.env.BLESTA_IMAGE ?? 'localhost/blesta:latest';
  const arch = (await composeOutput(['exec', '-T', 'blesta', 'uname', '-m'])).trim();
  const platform = process.env.BLESTA_PLATFORM ?? (arch === 'aarch64' ? 'linux/arm64' : 'linux/amd64');
  await runComposeE2E(['exec', '-T', 'blesta', 'sh', '-ec', 'printf recovery-probe > /opt/blesta/data/uploads/recovery-probe.txt']);
  const configHash = await composeOutput(['exec', '-T', 'blesta', 'sha256sum', '/opt/blesta/data/config/blesta.php']);
  const invoices = await runDatabaseQuery('SELECT id, total, paid FROM invoices ORDER BY id');
  const uploads = await composeOutput(['exec', '-T', 'blesta', 'sh', '-ec', 'find /opt/blesta/data/uploads -type f -exec sha256sum {} + | sort']);
  await runComposeE2E(['stop', 'blesta']);
  try {
    const database = await commandBuffer('docker', [...composeArgs, 'exec', '-T', 'mariadb', 'mariadb-dump', '-uroot', '-proot', '--single-transaction', '--routines', '--events', 'blesta']);
    const data = await commandBuffer('docker', ['run', '--rm', '--platform', platform, '--network', 'none', '--cap-drop', 'ALL', '--entrypoint', 'tar', '-v', 'blesta-test_blesta-data:/opt/blesta/data:ro', image, '-czf', '-', '-C', '/opt/blesta/data', '.']);
    await restore(['down', '--volumes', '--remove-orphans']);
    await restore(['create']);
    await commandBuffer('docker', ['run', '--rm', '-i', '--platform', platform, '--network', 'none', '--cap-drop', 'ALL', '--entrypoint', 'tar', '-v', 'blesta-restore_blesta-data:/opt/blesta/data', image, '-xzf', '-', '-C', '/opt/blesta/data'], data);
    await restore(['up', '--detach', '--wait', 'mariadb']);
    await restore(['exec', '-T', 'mariadb', 'mariadb', '-uroot', '-proot', 'blesta'], database);
    await restore(['up', '--detach', '--wait']);
    expect((await restore(['exec', '-T', 'blesta', 'sha256sum', '/opt/blesta/data/config/blesta.php'])).toString()).toBe(configHash);
    expect((await restore(['exec', '-T', 'blesta', 'sh', '-ec', 'find /opt/blesta/data/uploads -type f -exec sha256sum {} + | sort'])).toString()).toBe(uploads);
    const db = await mysql.createConnection({ host: 'localhost', port: 4212, user: 'blesta', password: 'blesta', database: 'blesta' });
    try {
      const [restoredInvoices] = await db.query('SELECT id, total, paid FROM invoices ORDER BY id');
      expect(restoredInvoices).toEqual(invoices);
    } finally { await db.end(); }
    const context = await browser.newContext({ baseURL: 'http://localhost:4210' });
    try {
      const page = await context.newPage();
      await loginAdmin(page);
      await page.goto('/admin/plugin/support_manager/admin_tickets/index/closed');
      await page.getByRole('row').filter({ hasText: 'Test Ticket via Mail' }).getByRole('link').first().click();
      const attachment = page.getByRole('link', { name: 'hello-world.txt' }).first();
      await expect(attachment).toBeVisible();
      const href = await attachment.getAttribute('href');
      const response = await page.request.get(href!);
      expect(response.status()).toBe(200);
      expect((await response.body()).toString()).toContain('Hello');
    } finally { await context.close(); }
  } finally {
    await restore(['down', '--volumes', '--remove-orphans']);
    await runComposeE2E(['up', '--detach', '--wait', 'blesta']);
  }
});
