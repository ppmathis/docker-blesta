import type { Reporter, TestCase, TestError, TestResult, TestStep } from '@playwright/test/reporter';

// Playwright records input values in action titles even when tracing is disabled.
// This reporter runs before the line/HTML reporters and scrubs their shared results.
export default class LicenseRedactor implements Reporter {
  private redact(value: string): string {
    const secret = process.env.BLESTA_LICENSE_KEY;
    return secret ? value.split(secret).join('<redacted>') : value;
  }

  private error(error?: TestError): void {
    if (!error) return;
    const fields = error as unknown as Record<string, unknown>;
    for (const key of ['message', 'stack', 'snippet', 'value']) {
      if (typeof fields[key] === 'string') fields[key] = this.redact(fields[key] as string);
    }
  }

  private step(step: TestStep): void {
    step.title = this.redact(step.title);
    this.error(step.error);
    step.steps.forEach((child) => this.step(child));
  }

  onStepBegin(_test: TestCase, _result: TestResult, step: TestStep): void { this.step(step); }
  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep): void { this.step(step); }
  onError(error: TestError): void { this.error(error); }
  onTestEnd(_test: TestCase, result: TestResult): void {
    result.steps.forEach((step) => this.step(step));
    result.errors.forEach((error) => this.error(error));
    result.stdout = result.stdout.map((chunk) => typeof chunk === 'string' ? this.redact(chunk) : Buffer.from(this.redact(chunk.toString())));
    result.stderr = result.stderr.map((chunk) => typeof chunk === 'string' ? this.redact(chunk) : Buffer.from(this.redact(chunk.toString())));
  }
}
