import { test, expect } from '@playwright/test';
import { api, createApi } from '../helper.api';
import { runDatabaseQuery } from '../helper.stack';

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test('completes a client checkout for a local package', async ({ playwright, page }) => {
  test.setTimeout(120_000);
  const context = await createApi(playwright);
  try {
    const groups = await api(context, 'client_groups', 'getAll', { company_id: 1 });
    const client = await api(context, 'clients', 'create', { vars: {
      username: 'checkout@example.com', new_password: 'Checkout-test-123!', confirm_password: 'Checkout-test-123!',
      client_group_id: groups[0].id, first_name: 'Checkout', last_name: 'Client', email: 'checkout@example.com',
      address1: '123 Test Street', city: 'New York', state: 'NY', zip: '10001', country: 'US',
      settings: { default_currency: 'USD', language: 'en_us' },
    } });
    const modules = await api(context, 'module_manager', 'getAll', { company_id: 1 });
    let module = modules.find((item: any) => item.class === 'none');
    if (!module) module = { id: await api(context, 'module_manager', 'add', { vars: { company_id: 1, class: 'none' } }) };
    const groupId = await api(context, 'package_groups', 'add', { vars: { company_id: 1, type: 'standard', names: [{ lang: 'en_us', name: 'Docker checkout group' }] } });
    const packageId = await api(context, 'packages', 'add', { vars: {
      company_id: 1, module_id: module.id, names: [{ lang: 'en_us', name: 'Docker checkout package' }], groups: [groupId],
      pricing: [{ term: 1, period: 'onetime', price: 0, currency: 'USD' }],
      email_content: [{ lang: 'en_us', text: 'Your local checkout service is ready.' }],
      descriptions: [{ lang: 'en_us', text: 'Local checkout validation', html: '<p>Local checkout validation</p>' }],
    } });
    await api(context, 'order.order_forms', 'add', { vars: {
      company_id: 1, label: 'docker-checkout', name: 'Docker checkout', description: 'Local checkout validation',
      template: 'standard', template_style: 'default', type: 'general', client_group_id: groups[0].id,
      groups: [groupId], currencies: ['USD'], visibility: 'public', status: 'active',
    } });
    await page.goto('/client/login/');
    await page.locator('[name="username"]').fill('checkout@example.com');
    await page.locator('[name="password"]').fill('Checkout-test-123!');
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.waitForURL('**/client/');
    await page.goto('/order/main/index/docker-checkout/');
    await expect(page.getByText('Docker checkout package', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Add to Cart/ }).click();
    await page.waitForURL(/\/order\/(config|cart)\//);
    if (page.url().includes('/order/config/')) {
      await page.getByRole('button', { name: /Continue/ }).click();
    }
    await page.getByRole('link', { name: /Checkout/ }).last().click();
    await expect(page).toHaveURL(/\/order\/checkout\/complete\/docker-checkout\//);
    await expect(page.getByText('Thank you for your order! Your order is now complete.')).toBeVisible();
    const orders = await runDatabaseQuery('SELECT o.id FROM orders o JOIN invoices i ON i.id = o.invoice_id WHERE i.client_id = ?', [client.id]);
    expect(orders).toHaveLength(1);
    const services = await runDatabaseQuery('SELECT s.id, s.status FROM services s JOIN package_pricing p ON p.id = s.pricing_id WHERE s.client_id = ? AND p.package_id = ?', [client.id, packageId]);
    expect(services).toHaveLength(1);
    expect(['pending', 'active']).toContain(services[0].status);
  } finally { await context.dispose(); }
});
