import { assertContainerLogs, runComposeE2E } from './helper.stack';

export default async function teardown(): Promise<void> {
  try {
    await assertContainerLogs();
  } finally {
    await runComposeE2E(['down', '--volumes', '--remove-orphans']);
  }
}
