import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

export function redact(value: string): string {
  const license = process.env.BLESTA_LICENSE_KEY;
  return license ? value.split(license).join('<redacted>') : value;
}

export async function commandBuffer(cmd: string, args: string[], input?: string | Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); }, 180_000);
    child.stdout.on('data', (data) => { stdout.push(data); });
    child.stderr.on('data', (data) => { stderr += data; });
    child.stdin.end(input);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(redact(`${cmd} exited with ${code}: ${stderr}`)));
      else resolve(Buffer.concat(stdout));
    });
  });
}

export async function commandOutput(cmd: string, args: string[], input?: string): Promise<string> {
  return (await commandBuffer(cmd, args, input)).toString('utf8');
}

export const composeArgs = ['compose', '--ansi', 'never', '-f', 'compose.test.yaml'];
export async function composeOutput(args: string[], input?: string): Promise<string> {
  return commandOutput('docker', [...composeArgs, ...args], input);
}
export async function runComposeE2E(args: string[]): Promise<void> {
  if (args[0] === 'restart' || args[0] === 'stop' || args.includes('--force-recreate')) {
    // Inspect logs before replacement discards the previous container's diagnostics.
    await assertContainerLogs();
  }
  await composeOutput(args);
}
export async function runCommand(cmd: string, args: string[]): Promise<void> {
  await commandOutput(cmd, args);
}

export async function runDatabaseQuery<T = any[]>(query: string, values: any[] = []): Promise<T> {
  const connection = await mysql.createConnection({
    host: 'localhost', port: 4202, user: 'blesta', password: 'blesta', database: 'blesta',
  });
  try {
    const [rows] = await connection.query(query, values);
    return rows as T;
  } finally {
    await connection.end();
  }
}

export async function waitForDatabase(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { await runDatabaseQuery('SELECT 1'); return; }
    catch { await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
  throw new Error('Database did not become ready within 120 seconds');
}

export async function assertContainerLogs(): Promise<void> {
  const logs = await composeOutput(['logs', '--no-color', 'blesta']);
  // Access logs can contain authentication and request parameters; emit only errors.
  const errors = logs.split('\n').filter((line) => /fatal error|uncaught|\bdeprecated\b|general\.(ERROR|CRITICAL)|E_WARNING/i.test(line));
  const knownUpstream = [
    /E_WARNING: Attempt to read property "value" on false .*app[\\/]models[\\/]license\.php/,
    /E_DEPRECATED: hash_hmac\(\): Passing null to parameter #2 .*Crypt[\\/]Hash\.php/,
    /E_DEPRECATED: strtotime\(\): Passing null to parameter #1 .*feed_reader_feeds\.php/,
    /E_DEPRECATED: Creation of dynamic property .*Oauth2Transport::\$Companies .*Lib[\\/]Loader\.php/,
  ];
  const version = process.env.BLESTA_EXPECTED_VERSION ?? process.env.BLESTA_IMAGE?.match(/:([56]\.\d+\.\d+)/)?.[1];
  if (version?.startsWith('5.')) {
    knownUpstream.push(
      /E_WARNING: Attempt to read property "value" on bool .*app[\\/]models[\\/]license\.php/,
      /E_WARNING: Undefined array key "(updates|label)" .*app[\\/]app_controller\.php/,
      /E_DEPRECATED: Creation of dynamic property TicketManager::\$(SupportManagerDepartments|Html|EmailParser|SupportManagerTickets|Settings|Blacklist) .*Lib[\\/]Loader\.php/,
      /E_DEPRECATED: Creation of dynamic property MimeMailParser::\$parts .*MimeMailParser\.class\.php/,
      /E_WARNING: Attempt to read property "start_date" on bool .*plugins[\\/]domains[\\/]domains_plugin\.php/,
    );
  }
  const unexpected = errors.filter((line) => !knownUpstream.some((signature) => signature.test(line)));
  if (errors.length) console.error(redact(errors.join('\n')));
  if (unexpected.length) throw new Error('Unexpected PHP errors in container logs');
}
