import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
/** Public reporter API; records retries without hiding failed or inconclusive attempts. */
export default class ReproReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    process.stdout.write(
      JSON.stringify({
        type: 'repro-attempt',
        title: test.titlePath(),
        status: result.status,
        retry: result.retry,
        durationMs: result.duration,
        artifacts: result.attachments
          .filter((a) => a.name === 'repro-run')
          .map((a) => a.path),
      }) + '\n',
    );
  }
}
