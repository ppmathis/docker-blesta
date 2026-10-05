import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'blesta-reporter-'));
const sentinel = `reporter-test-${randomUUID()}`;
try {
  const testImport = resolve('node_modules/@playwright/test/index.mjs');
  writeFileSync(join(dir, 'reporter.spec.mjs'), `
import { test } from ${JSON.stringify(testImport)};
test('records a sensitive fill action', async ({ page }) => {
  await page.setContent('<input id="license">');
  await page.locator('#license').fill(process.env.BLESTA_LICENSE_KEY);
});
test('records a sensitive failure', async () => {
  throw new Error('Expected redaction probe: ' + process.env.BLESTA_LICENSE_KEY);
});
`);
  writeFileSync(join(dir, 'config.mjs'), `export default ${JSON.stringify({
    testDir: dir, workers: 1, retries: 0,
    outputDir: join(dir, 'results'),
    reporter: [[resolve('tests/reporter.ts')], ['line'], ['html', { open: 'never', outputFolder: join(dir, 'report') }]],
    use: { trace: 'off', screenshot: 'off', video: 'off' },
  })};`);
  const result = spawnSync(process.execPath, [resolve('node_modules/playwright/cli.js'), 'test', '-c', join(dir, 'config.mjs')], {
    env: { ...process.env, BLESTA_LICENSE_KEY: sentinel }, encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(result.status, 1, 'Expected the deliberate failure to execute');
  assert.match(result.stdout, /1 passed/);
  assert.match(result.stdout, /1 failed/);
  assert(!`${result.stdout}${result.stderr}`.includes(sentinel), 'License leaked into terminal output');
  const html = readFileSync(join(dir, 'report/index.html'), 'utf8');
  assert(!html.includes(sentinel), 'License leaked into report HTML');
  const archive = html.match(/data:application\/zip;base64,([A-Za-z0-9+/=]+)/);
  assert(archive, 'Missing embedded report archive');
  const zipPath = join(dir, 'report.zip');
  writeFileSync(zipPath, Buffer.from(archive[1], 'base64'));
  const contents = execFileSync('unzip', ['-p', zipPath]);
  assert(!contents.includes(Buffer.from(sentinel)), 'License leaked into embedded report data');
  assert(contents.includes(Buffer.from('<redacted>')), 'Redaction was not exercised');
  console.log('Action titles, failure diagnostics, and embedded report data redact the license.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
