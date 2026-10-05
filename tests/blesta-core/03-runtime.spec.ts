import { test, expect, type APIRequestContext } from '@playwright/test';
import { api, createApi } from '../helper.api';
import { commandOutput, composeOutput, runComposeE2E, runDatabaseQuery } from '../helper.stack';
import { handleAccessVerification, loginAdmin } from '../helper.blesta';

let context: APIRequestContext;
test.describe('Production runtime', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });
  test.beforeAll(async ({ playwright }) => { context = await createApi(playwright); });
  test.afterAll(async () => { await context?.dispose(); });

  test('runs the intended version and platform with immutable application files', async ({ request }) => {
    const version = await api(context, 'settings', 'getVersion');
    const configured = (await composeOutput(['exec', '-T', 'blesta', 'printenv', 'BLESTA_VERSION'])).trim();
    expect(version).toBe(process.env.BLESTA_EXPECTED_VERSION ?? configured);
    const php = (await composeOutput(['exec', '-T', 'blesta', 'php', '-r', 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;'])).trim();
    const expectedPhp = process.env.BLESTA_EXPECTED_PHP ?? (await composeOutput(['exec', '-T', 'blesta', 'printenv', 'PHP_VERSION'])).trim();
    expect(php).toBe(expectedPhp);
    const arch = (await composeOutput(['exec', '-T', 'blesta', 'uname', '-m'])).trim();
    expect(['x86_64', 'aarch64']).toContain(arch);
    if (process.env.BLESTA_PLATFORM) expect(arch).toBe(process.env.BLESTA_PLATFORM === 'linux/amd64' ? 'x86_64' : 'aarch64');
    expect((await composeOutput(['exec', '-T', 'blesta', 'id', '-u'])).trim()).toBe('65532');
    await runComposeE2E(['exec', '-T', 'blesta', 'sh', '-ec', 'test ! -w /opt/blesta/public/index.php; test -w /opt/blesta/data/config; test -w /opt/blesta/cache_blesta; nginx -t -c /run/nginx.conf; php-fpm -t']);
    expect((await request.get('/healthz')).status()).toBe(204);
    await runComposeE2E(['exec', '-T', 'blesta', 'sh', '-ec', 'printf cache-probe > /opt/blesta/data/cache/docker-probe.json']);
    expect((await request.get('/cache/docker-probe.json')).status()).toBe(404);
    for (const path of ['/config/blesta.php', '/config/release-signing-key.pub', '/app/models/license.php', '/.env', '/.git/config', '/composer.json', '/composer.lock']) {
      expect((await request.get(path)).status()).toBe(404);
    }
  });

  test('retains installed configuration, encryption keys, and records across restart and recreation', async ({ page }) => {
    const fingerprint = await composeOutput(['exec', '-T', 'blesta', 'sha256sum', '/opt/blesta/data/config/blesta.php']);
    const clients = await runDatabaseQuery('SELECT COUNT(*) AS total FROM clients');
    await runComposeE2E(['restart', 'blesta']);
    await runComposeE2E(['up', '--detach', '--no-deps', '--force-recreate', '--wait', 'blesta']);
    expect(await composeOutput(['exec', '-T', 'blesta', 'sha256sum', '/opt/blesta/data/config/blesta.php'])).toBe(fingerprint);
    expect(await runDatabaseQuery('SELECT COUNT(*) AS total FROM clients')).toEqual(clients);
    await loginAdmin(page);
    await page.goto('/admin/settings/company/emails/mail/');
    // Reading encrypted SMTP settings after recreation also exercises the preserved key.
    await handleAccessVerification(page);
    await expect(page.getByRole('textbox', { name: 'SMTP Host' })).toHaveValue('mailpit');
  });

  test('runs CLI and scheduled cron and reports successful completion locally', async ({ request }) => {
    const count = async () => Number(await (await request.get('http://localhost:4204/count')).text());
    const before = await count();
    await runComposeE2E(['exec', '-T', 'blesta', '/usr/local/bin/blesta-cron']);
    await expect.poll(count).toBeGreaterThan(before);
    const afterCli = await count();
    process.env.BLESTA_TEST_CRON_SCHEDULE = '* * * * *';
    try {
      await runComposeE2E(['up', '--detach', '--no-deps', '--force-recreate', '--wait', 'blesta']);
      await expect.poll(count, { timeout: 90_000, intervals: [1000] }).toBeGreaterThan(afterCli);
      const runs = await runDatabaseQuery('SELECT COUNT(*) AS total FROM log_cron WHERE end_date IS NOT NULL');
      expect(Number(runs[0].total)).toBeGreaterThan(0);
    } finally {
      delete process.env.BLESTA_TEST_CRON_SCHEDULE;
      await runComposeE2E(['up', '--detach', '--no-deps', '--force-recreate', '--wait', 'blesta']);
    }
  });

  test('fails startup without required configuration and exits when PHP-FPM dies', async () => {
    await expect(composeOutput(['run', '--rm', '--no-deps', '-e', 'BLESTA_HOST=', 'blesta'])).rejects.toThrow('BLESTA_HOST is not set');
    await runComposeE2E(['exec', '-T', 'blesta', 'sh', '-c', 'kill -TERM $(cat /run/php-fpm.pid)']);
    await expect.poll(async () => {
      const id = (await composeOutput(['ps', '--all', '--quiet', 'blesta'])).trim();
      return (await commandOutput('docker', ['inspect', '--format', '{{.State.Running}}', id])).trim();
    }).toBe('false');
    await runComposeE2E(['up', '--detach', '--no-deps', '--wait', 'blesta']);
  });
});
