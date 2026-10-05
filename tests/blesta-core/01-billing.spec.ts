import { test, expect, type APIRequestContext } from '@playwright/test';
import { api, createApi } from '../helper.api';
import { loginAdmin, runManualCron } from '../helper.blesta';
import { runDatabaseQuery } from '../helper.stack';

let context: APIRequestContext;
let client: any;
let serviceId: number;
let invoiceId: number;

test.describe('Core billing and service lifecycle', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.beforeAll(async ({ playwright }) => { context = await createApi(playwright); });
  test.afterAll(async () => { await context?.dispose(); });

  test('creates and edits a client through the authenticated API', async () => {
    const groups = await api(context, 'client_groups', 'getAll', { company_id: 1 });
    client = await api(context, 'clients', 'create', { vars: {
      username: 'client@example.com', new_password: 'Client-test-123!', confirm_password: 'Client-test-123!',
      client_group_id: groups[0].id, first_name: 'Docker', last_name: 'Client', email: 'client@example.com',
      company: 'Docker validation', address1: '123 Test Street', address2: 'Suite 1',
      city: 'New York', state: 'NY', zip: '10001', country: 'US', settings: { default_currency: 'USD', language: 'en_us' },
    } });
    expect(Number(client.id)).toBeGreaterThan(0);
    await api(context, 'clients', 'edit', { client_id: client.id, vars: { status: 'inactive' } });
    expect((await api(context, 'clients', 'get', { client_id: client.id })).status).toBe('inactive');
    await api(context, 'clients', 'edit', { client_id: client.id, vars: { status: 'active' } });
  });

  test('rejects invalid API credentials', async ({ request }) => {
    const response = await request.get('/api/clients/get.json?client_id=1', { headers: { Authorization: 'Basic aW52YWxpZDppbnZhbGlk' } });
    expect(response.status()).toBe(401);
  });

  test('creates a local package and activates, suspends, resumes, and cancels its service', async () => {
    const modules = await api(context, 'module_manager', 'getAll', { company_id: 1 });
    let module = modules.find((item: any) => item.class === 'none');
    if (!module) module = { id: await api(context, 'module_manager', 'add', { vars: { company_id: 1, class: 'none' } }) };
    const packageId = await api(context, 'packages', 'add', { vars: {
      company_id: 1, module_id: module.id, names: [{ lang: 'en_us', name: 'Docker local service' }],
      pricing: [{ term: 1, period: 'month', price: 10, currency: 'USD' }],
      email_content: [{ lang: 'en_us', text: 'Your local service is ready.' }],
      descriptions: [{ lang: 'en_us', text: 'Local service validation', html: '<p>Local service validation</p>' }],
    } });
    const pkg = await api(context, 'packages', 'get', { package_id: packageId });
    serviceId = await api(context, 'services', 'add', { vars: { client_id: client.id, pricing_id: pkg.pricing[0].id, status: 'active', use_module: 'true' } });
    expect((await api(context, 'services', 'get', { service_id: serviceId })).status).toBe('active');
    await api(context, 'services', 'suspend', { service_id: serviceId });
    expect((await api(context, 'services', 'get', { service_id: serviceId })).status).toBe('suspended');
    await api(context, 'services', 'unsuspend', { service_id: serviceId });
    expect((await api(context, 'services', 'get', { service_id: serviceId })).status).toBe('active');
    await api(context, 'services', 'cancel', { service_id: serviceId, vars: { date_canceled: new Date().toISOString().slice(0, 19).replace('T', ' ') } });
    expect((await api(context, 'services', 'get', { service_id: serviceId })).status).toBe('canceled');
  });

  test('creates an invoice and applies an offline payment', async () => {
    const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
    invoiceId = await api(context, 'invoices', 'add', { vars: {
      client_id: client.id, date_billed: date, date_due: date, status: 'active', currency: 'USD', note_public: 'Docker invoice validation', note_private: '',
      lines: [{ description: 'Docker invoice', qty: 1, amount: 12.50, tax: 0 }],
    } });
    let invoice = await api(context, 'invoices', 'get', { invoice_id: invoiceId });
    expect(Number(invoice.total)).toBe(12.5);
    const transactionId = await api(context, 'transactions', 'add', { vars: {
      client_id: client.id, amount: 12.5, currency: 'USD', type: 'other', status: 'approved',
    } });
    await api(context, 'transactions', 'apply', { transaction_id: transactionId, vars: { amounts: [{ invoice_id: invoiceId, amount: 12.5 }] } });
    invoice = await api(context, 'invoices', 'get', { invoice_id: invoiceId });
    expect(Number(invoice.paid)).toBe(12.5);
    expect(invoice.date_closed).toBeTruthy();
    expect(Number(invoice.due)).toBe(0);
  });

  test('downloads a valid invoice PDF through the admin interface', async ({ page }) => {
    await loginAdmin(page);
    const response = await page.request.get(`/admin/clients/viewinvoice/${client.id}/${invoiceId}/`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('logs in and out as a client', async ({ page }) => {
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.goto('/client/login/');
      await page.locator('input[name="username"]').fill('client@example.com');
      await page.locator('input[name="password"]').fill('Client-test-123!');
      await page.getByRole('button', { name: 'Log In' }).click();
      await expect(page).toHaveURL(/\/client\/$/);
      // Legacy dashboard widgets write session state. Finish them before logout.
      await page.waitForLoadState('networkidle');
      await page.getByRole('link', { name: 'Docker Client' }).click();
      await page.getByRole('link', { name: 'Log Out' }).click();
      await expect(page).toHaveURL(/\/client\/login/);
      await page.waitForLoadState('networkidle');
      await page.goto('/client/');
      await expect(page).toHaveURL(/\/client\/login/);
      await expect(page.locator('input[name="password"]')).toBeVisible();
    }
  });

  test('logs out as an admin and requires authentication again', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('/admin/logout/');
    await page.goto('/admin/');
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test('generates a recurring invoice using cron', async ({ page }) => {
    const date = new Date(Date.now() - 86400_000).toISOString().slice(0, 19).replace('T', ' ');
    const recurringId = await api(context, 'invoices', 'addRecurring', { vars: {
      client_id: client.id, term: 1, period: 'month', duration: 2, date_renews: date, currency: 'USD',
      lines: [{ description: 'Docker recurring invoice', qty: 1, amount: 5, tax: 0 }],
    } });
    expect(Number(recurringId)).toBeGreaterThan(0);
    await loginAdmin(page);
    const task = await api(context, 'cron_tasks', 'getTaskRunByKey', { key: 'create_invoice' });
    expect(task.task_run_id).toBeTruthy();
    // Configure the company timezone so the daily task is deterministically due.
    await api(context, 'companies', 'setSetting', { company_id: 1, key: 'timezone', value: 'UTC' });
    await api(context, 'cron_tasks', 'editTaskRun', { task_run_id: task.task_run_id, vars: { enabled: 1, time: '00:00' } });
    await runManualCron(page);
    const rows = await runDatabaseQuery('SELECT i.id FROM invoices i JOIN invoice_lines l ON l.invoice_id = i.id WHERE i.client_id = ? AND l.description LIKE ?', [client.id, 'Docker recurring invoice%']);
    expect(rows).toHaveLength(1);
    expect(Number((await api(context, 'invoices', 'get', { invoice_id: rows[0].id })).total)).toBe(5);
  });
});
