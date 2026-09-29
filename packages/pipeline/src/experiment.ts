import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MonotonicClockBridge, ReproStore } from '@jitterbox/repro-core';
import { startPageScreencast } from '@jitterbox/repro-capture';
import { writeJson } from './evidence-run.js';
/** Identical capture-owner fixtures; never run native and CDP on the same page. */
export async function experimentNative(directory: string) {
  await mkdir(directory, { recursive: true });
  const results = [];
  for (const backend of ['cdp', 'native'] as const)
    for (const tracing of ['off', 'snapshots', 'screenshots'] as const) {
      const trace = tracing !== 'off';
      const browser = await chromium.launch();
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const root = join(directory, `${backend}-${tracing}`);
      await mkdir(root, { recursive: true });
      const store = new ReproStore({ path: join(root, 'capture.db') });
      const config = {
        mode: 'repro' as const,
        profile: 'controlled' as const,
        surfaceCapture: 'page' as const,
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        features: {},
        metadata: {},
      };
      const runId = store.createRun({ config });
      const clock = new MonotonicClockBridge();
      const captures = [];
      let error: string | null = null;
      try {
        if (trace)
          await context.tracing.start({
            screenshots: tracing === 'screenshots',
            snapshots: true,
          });
        captures.push(
          await startPageScreencast({
            page,
            pageId: 'main',
            clock,
            directory: join(root, 'main'),
            store,
            runId,
            viewport: config.viewport,
            backend,
          }),
        );
        await Promise.all(captures.map((capture) => capture.ready()));
        await page.setContent(
          '<title>Capture acceptance</title><button onclick="window.open(\'about:blank\')">Open popup</button><div style="width:400px;height:300px;background:blue"></div>',
        );
        await page.waitForTimeout(300);
        await page.getByRole('button').evaluate((el) => {
          el.textContent = 'Changed';
        });
        await page.waitForTimeout(200);
        const [popup] = await Promise.all([
          page.waitForEvent('popup'),
          page.getByRole('button').click(),
        ]);
        await popup.setViewportSize(config.viewport);
        captures.push(
          await startPageScreencast({
            page: popup,
            pageId: 'popup',
            clock,
            directory: join(root, 'popup'),
            store,
            runId,
            viewport: config.viewport,
            backend,
          }),
        );
        await Promise.all(captures.map((capture) => capture.ready()));
        await popup.setContent('<h1>Popup capture</h1>');
        await popup.waitForTimeout(200);
      } catch (failure) {
        error =
          failure instanceof Error ? failure.message : 'Experiment failed';
      } finally {
        const stopped = await Promise.allSettled(
          captures.map((capture) => capture.stop()),
        );
        const failures = stopped.filter(
          (result) => result.status === 'rejected',
        );
        if (failures.length)
          error = [error, ...failures.map((result) => String(result.reason))]
            .filter(Boolean)
            .join('; ');
        if (trace) {
          try {
            await context.tracing.stop({ path: join(root, 'trace.zip') });
          } catch (failure) {
            error = [error, String(failure)].filter(Boolean).join('; ');
          }
        }
        await context.close();
        await browser.close();
        store.close();
      }
      results.push({
        backend,
        trace,
        tracing,
        status: error ? 'failed' : 'passed',
        durationMs: clock.nowMono(),
        droppedFrames: captures.reduce((n, c) => n + c.droppedCount, 0),
        error,
        artifacts: root,
      });
    }
  const result = {
    promoted: false,
    decision:
      'Retain CDP until all timing, clean-pixel, popup and overhead acceptance gates pass.',
    results,
  };
  await writeJson(join(directory, 'experiment.json'), result);
  return result;
}
