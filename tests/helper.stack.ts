import { spawn } from 'child_process';
import mysql from 'mysql2/promise';

export async function runComposeE2E(args: string[]): Promise<void> {
  await runCommand('docker', ['compose', '--ansi', 'never', '-f', 'compose.test.yaml', ...args]);
}

export async function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    const outputBuffers = { stdout: '', stderr: '' };

    const handleStream = (stream: NodeJS.ReadableStream, bufferName: string, outputFn: (data: string) => void) => {
      stream.setEncoding('utf8');
      stream.on('data', (data) => {
        outputBuffers[bufferName] += data;
        let lines = outputBuffers[bufferName].split('\n');
        outputBuffers[bufferName] = lines.pop();

        for (const line of lines) {
          outputFn(line);
        }
      });
    };

    // Stream stdout and stderr to console
    handleStream(child.stdout, 'stdout', console.log);
    handleStream(child.stderr, 'stderr', console.error);

    // Resolve promise when process exits
    child.on('close', (code) => {
      // Ensure all output is flushed before resolving
      const remainingStdout = outputBuffers.stdout.trim();
      if (remainingStdout) console.log(remainingStdout);

      const remainingStderr = outputBuffers.stderr.trim();
      if (remainingStderr) console.error(remainingStderr);

      // Check if the process exited with a non-zero code
      if (code !== 0) {
        reject(new Error(`Command [${cmd} ${args.join(' ')}] exited with code ${code}`));
      } else {
        resolve();
      }
    });

    // Reject promise if process errors
    child.on('error', reject);
  });
}

async function getDatabaseConnection(
  host: string = 'localhost',
  port: number = 4202,
  user: string = 'blesta',
  password: string = 'blesta',
  database: string = 'blesta'
): Promise<mysql.Connection> {
  return await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });
}

export async function waitForDatabase(): Promise<void> {
  const retry_limit = 15;
  const retry_delay = 1000;

  let connection: mysql.Connection;
  let retries = 0;

  while (retries < retry_limit) {
    try {
      // Attempt to connect to the database
      connection = await getDatabaseConnection();

      // Test connection
      await connection.query('SELECT 1');
      await connection.end();

      // Database is ready
      return;
    } catch (error) {
      retries++;
      await new Promise((resolve) => setTimeout(resolve, retry_delay));
    }
  }

  throw new Error(`Database did not become ready within ${retry_limit} attempts`);
}

export async function runDatabaseQuery(query: string): Promise<void> {
  const connection = await getDatabaseConnection();
  try {
    await connection.query(query);
  } finally {
    await connection.end();
  }
}
