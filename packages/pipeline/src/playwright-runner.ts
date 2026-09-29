import { createRequire } from 'node:module';
import { resolve } from 'node:path';

/** A Playwright runner and its imported fixture must share the same module instance. */
export function scenarioPlaywrightRunner(spec: string): string {
  const scenario = createRequire(resolve(spec));
  let fixture: string;
  try {
    fixture = scenario.resolve('@jitterbox/repro-playwright');
  } catch (error) {
    throw new Error(
      'The scenario cannot resolve @jitterbox/repro-playwright. Install the public fixture in its project and import test from @jitterbox/repro-playwright.',
      { cause: error },
    );
  }
  // Resolve from the fixture, not Repro's pipeline package or the caller's cwd.
  // Identical version numbers in separate installs still have distinct globals.
  return createRequire(fixture).resolve('@playwright/test/cli');
}
