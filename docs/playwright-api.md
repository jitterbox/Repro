# Playwright scenarios and observations

Import `test`, `expect` and `humanPointer` from `@jitterbox/repro-playwright`. Ordinary Playwright setup, locators, frames, authentication, assertions, projects and retries remain available. The `repro` fixture owns capture and its clock. IDs must be declared in the committed evidence specification. Run via `repro run` so provenance, output paths and runner selection are established consistently.

```ts
import { test, expect, humanPointer } from '@jitterbox/repro-playwright';

test('Open report settings', async ({ page, repro }) => {
  const pointer = humanPointer(page);
  await repro.step('open', async () => {
    await page.goto(process.env.REPRO_URL!);
    repro.target('settings', page.getByRole('button', { name: 'Settings' }));
    await pointer.click(page.getByRole('button', { name: 'Settings' }));
    await page.waitForTimeout(1800);
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect(page.getByRole('heading', { name: 'Report settings' })).toBeVisible());
    await repro.checkpoint('result');
  });
});
```

Declare `open`/`verify` steps, the `settings` target and `result` checkpoint in `evidence.json`. This example is a scenario fragment, not a complete claim/config. Use `repro init` and [the evidence schema](reference/schemas/evidence-schema.json) for the required structure. Real examples are in [Web-Dash](https://github.com/jitterbox/Repro/blob/master/packages/playwright/examples/web-dash/README.md) and [the fixture scenarios](https://github.com/jitterbox/Repro/blob/master/packages/playwright/examples/).

## API reference

The shipped TypeScript declarations provide exact argument and return types; the [implementation's exported class](https://github.com/jitterbox/Repro/blob/master/packages/playwright/src/index.ts) is the complete method reference. Supported methods include:

| Method | Purpose and important constraint |
| --- | --- |
| `target(id, locator)` | Bind a declared target to one actual locator; checkpoint geometry is measured from the browser |
| `step(id, action)` | Execute a declared step and record its actual interval |
| `checkpoint(id, page?)` | Capture synchronized pixels, bounds and relevant DOM/style observations; event-linked transient checkpoints are resolved after capture |
| `outcome(checkpoint, assertion)` | Record a designated failing/passing assertion; unrelated errors stay errors |
| `segment(id, action, page?)` | Record a declared timing-sensitive interval around its trigger |
| `hitTest(checkpoint, target, point?)` | Measure hit-test observations at a point; does not prove a complete invisible hit region |
| `check(checkpoint, title, assertion, page?)` | Record an ordinary prerequisite check; an assertion failure remains a test failure |
| `ready(page?)` | Register/readiness-check a page with the capture owner |
| `visibility(checkpoint, target)` | Record measured visibility and obstruction context |
| `network(checkpoint, response)` | Link a Playwright response to a checkpoint; status observation alone is not a success assertion |
| `accessibility(checkpoint, page?)` | Run in-page axe diagnostics and record violations/incomplete checks |
| `dispose()` | Stop state subscriptions; fixture teardown calls this automatically |
| `observe(name, reader, page?)` | Snapshot a JSON-serializable application value at observation time |
| `watch(name, reader, options?)` | Sample application values; options are `intervalMs` (default 100, minimum 50) and `page`; returns an async stop function; reports sampling coverage/limits |

Browser console, exceptions, request lifecycle, supported performance entries and checkpoint observations are collected automatically. Read coverage instead of assuming arbitrary application closure state, request bodies, storage or worker internals were captured. `observe`/`watch` readers are explicit scenario code and may use `page.evaluate`; repository context can help locate state adapters.

## Human pointer input

Create one controller per page: `const pointer = humanPointer(page)`. `pointer.move(x, y, durationMs = 640)` dispatches a curved, eased sequence of real mouse positions. `pointer.approach(locator)` scrolls to and approaches a locator. `pointer.click(locator, { button?, double?, force? })` approaches, then clicks with an 85ms delay. Avoid forced clicks for interaction defects. `humanApproach(from, to, count = 32)` exposes the deterministic curve calculation.

Use normal QA pacing (typically 1.5–2 seconds between actions), with explicit scenario waits when observation is needed. The renderer can add reading holds later; it cannot reconstruct an unrecorded path. Use Playwright mouse down/move/up for a held gesture and declare the relevant steps/segments. Changing input timing is an execution change requiring recapture. Preserve native timing around a transient trigger and slow only captured frames in presentation.

## No source repository required

A separate Node evidence project can navigate to any authorized QA URL. Authentication stays in a fixture or environment/vault integration; do not embed secrets in ticket context, prompt text or shareable bundles. With repository access, build IDs and explicit state readers provide additional context without replacing browser observations.
