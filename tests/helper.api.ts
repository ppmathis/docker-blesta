import { randomBytes } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { runDatabaseQuery } from './helper.stack';

export async function createApi(playwright: Pick<typeof import('@playwright/test'), 'request'>): Promise<APIRequestContext> {
  const key = randomBytes(32).toString('hex');
  await runDatabaseQuery('DELETE FROM api_keys WHERE user = ?', ['docker-e2e']);
  await runDatabaseQuery('INSERT INTO api_keys (company_id, user, `key`, date_created) VALUES (1, ?, ?, UTC_TIMESTAMP())', ['docker-e2e', key]);
  return playwright.request.newContext({
    baseURL: 'http://localhost:4200',
    extraHTTPHeaders: { Authorization: `Basic ${Buffer.from(`docker-e2e:${key}`).toString('base64')}` },
  });
}

function flatten(value: any, prefix: string, out: Record<string, string>): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) flatten(item, `${prefix}[${key}]`, out);
  } else out[prefix] = String(value);
}

export async function api<T = any>(context: APIRequestContext, model: string, method: string, params: Record<string, any> = {}): Promise<T> {
  const form: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) flatten(value, key, form);
  const response = await context.post(`/api/${model}/${method}.json`, { form });
  const result = await response.json();
  // Never include headers, request bodies, or generated API credentials in diagnostics.
  expect(response.status(), `${model}.${method}: ${JSON.stringify(result.errors ?? result.response)}`).toBe(200);
  expect(result.errors, `${model}.${method}`).toBeFalsy();
  return result.response as T;
}
