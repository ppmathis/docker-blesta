import { randomBytes } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { composeOutput, runDatabaseQuery } from './helper.stack';

const encryptApiKeyScript = [
  "include '/opt/blesta/public/lib/init.php';",
  '$models = new stdClass();',
  "Loader::loadModels($models, ['Settings']);",
  'echo $models->Settings->systemEncrypt(stream_get_contents(STDIN));',
].join(' ');

function isVersionAtLeast(version: string, minimum: string): boolean {
  const actualParts = version.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  for (let index = 0; index < minimumParts.length; index++) {
    const difference = (actualParts[index] ?? 0) - minimumParts[index];
    if (difference !== 0) return difference > 0;
  }
  return true;
}

async function toStoredApiKey(key: string): Promise<string> {
  const version = (await composeOutput(['exec', '-T', 'blesta', 'printenv', 'BLESTA_VERSION'])).trim();
  if (!isVersionAtLeast(version, '6.0.5')) return key;

  // Blesta 6.0.5+ stores API keys encrypted with the system key; pass the key via stdin to keep it out of process args.
  return (await composeOutput(['exec', '-T', 'blesta', 'php', '-r', encryptApiKeyScript], key)).trim();
}

export async function createApi(playwright: Pick<typeof import('@playwright/test'), 'request'>): Promise<APIRequestContext> {
  const key = randomBytes(32).toString('hex');
  const storedKey = await toStoredApiKey(key);
  await runDatabaseQuery('DELETE FROM api_keys WHERE user = ?', ['docker-e2e']);
  await runDatabaseQuery('INSERT INTO api_keys (company_id, user, `key`, date_created) VALUES (1, ?, ?, UTC_TIMESTAMP())', ['docker-e2e', storedKey]);
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
