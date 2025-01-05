import { test, expect } from '@playwright/test';

test.describe('Order Forms', () => {
  test('should visit basic-http form insecurely', async ({ page }) => {
    await page.goto('http://localhost:4200/order/cart/index/basic-http/');
    await expect(page.locator('.title')).toHaveText('Basic - HTTP');
  });

  test('should visit basic-http form securely', async ({ page }) => {
    await page.goto('https://localhost:4201/order/cart/index/basic-http/');
    await expect(page.locator('.title')).toHaveText('Basic - HTTP');
  });

  test('should redirect to https for basic-http form', async ({ page }) => {
    await page.goto('http://localhost:4200/order/cart/index/basic-https/');
    await page.waitForURL(/https:\/\/.*/);
  });

  test('should visit basic-https form securely', async ({ page }) => {
    await page.goto('https://localhost:4201/order/cart/index/basic-https/');
    await expect(page.locator('.title')).toHaveText('Basic - HTTPS');
  });
});
