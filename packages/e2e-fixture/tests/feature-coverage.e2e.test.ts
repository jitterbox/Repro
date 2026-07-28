import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { loadBug } from '../src/bugs.js';
import {
  assertVideo,
  configFromBug,
  runScenarioAnnotate,
  runScenarioCapture,
  runScenarioCompare,
  runScenarioPackage,
  withServer,
  writeQualityPass,
} from '../src/harness.js';
import {
  driveA11y,
  driveCls,
  driveConsoleSave,
  driveContrast,
  driveDemo,
  driveGeometry,
  driveHoverHidden,
  driveMenuExport,
  driveMultiShape,
  drivePointer,
  drivePopup,
  driveRedaction,
  driveTiming,
} from '../src/scenarios/drivers.js';

import type { CompareManifest } from '@repro/compare';
import type { ReproConfig } from '@repro/core';

describe('ShopLite feature-coverage videos', () => {
  it('repro-functional-menu covers stacking + steps + showActions', async () => {
    const bug = await loadBug('BUG-1004');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveMenuExport,
        fixture: 'broken',
        scenario: 'repro-functional-menu',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-functional-menu',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
      const plan = JSON.parse(await readFile(annotated.planPath, 'utf8')) as {
        chapters: unknown[];
      };
      expect(plan.chapters.length).toBeGreaterThan(0);
    });
  }, 180_000);

  it('repro-console-multi covers consoleOverlay', async () => {
    const bug = await loadBug('BUG-1008');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveConsoleSave,
        fixture: 'broken',
        scenario: 'repro-console-multi',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-console-multi',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('repro-timing-pause-slowmo covers freeze/pause/vitals', async () => {
    const bug = await loadBug('BUG-1010');
    const config = mergeFeatures(configFromBug(bug), {
      pauses: true,
      slowmo: true,
      freezeDetect: true,
      vitalsHud: true,
    });
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveTiming,
        fixture: 'broken',
        scenario: 'repro-timing-pause-slowmo',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-timing-pause-slowmo',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('repro-cls-zoom covers layoutShiftViz', async () => {
    const bug = await loadBug('BUG-1009');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveCls,
        fixture: 'broken',
        scenario: 'repro-cls-zoom',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-cls-zoom',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('repro-hover-hidden covers hiddenElements + cursor', async () => {
    const bug = await loadBug('BUG-1005');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveHoverHidden,
        fixture: 'broken',
        scenario: 'repro-hover-hidden',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-hover-hidden',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('repro-pointer-right-drag covers right-click and drag', async () => {
    const bug = await loadBug('BUG-1006');
    const config = mergeFeatures(configFromBug(bug), {
      cursor: true,
      hitTargets: true,
      clickViz: true,
    });
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: drivePointer,
        fixture: 'broken',
        scenario: 'repro-pointer-right-drag',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-pointer-right-drag',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('repro-a11y-keyboard covers keystrokes and hit targets', async () => {
    const bug = await loadBug('BUG-1013');
    const config = mergeFeatures(configFromBug(bug), {
      hitTargets: true,
      zoom: true,
      a11yOverlay: true,
      keystrokes: true,
    });
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveA11y,
        fixture: 'broken',
        scenario: 'repro-a11y-keyboard',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-a11y-keyboard',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('repro-multipage-popup covers editorial cuts', async () => {
    const bug = await loadBug('BUG-1014');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: drivePopup,
        fixture: 'broken',
        scenario: 'repro-multipage-popup',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-multipage-popup',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
      const events = await readFile(capture.eventsPath, 'utf8');
      expect(events.includes('cut') || events.includes('page')).toBe(true);
    });
  }, 180_000);

  it('repro-redaction-strict covers redaction feature', async () => {
    const bug = await loadBug('BUG-1012');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveRedaction,
        fixture: 'broken',
        scenario: 'repro-redaction-strict',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'repro-redaction-strict',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
      expect(config.redaction?.strict).toBe(true);
    });
  }, 180_000);

  it('demo-walkthrough covers demo + voiceover knobs', async () => {
    const config: ReproConfig = {
      mode: 'demo',
      profile: 'controlled',
      surfaceCapture: 'page',
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      features: {
        voiceover: true,
        cursor: true,
        steps: true,
        clickViz: true,
        specCard: true,
      },
      metadata: { specTitle: 'ShopLite demo walkthrough' },
    };
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: driveDemo,
        fixture: 'fixed',
        scenario: 'demo-walkthrough',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'demo-walkthrough',
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('compare-geometry-misalign covers compare layouts + geometry', async () => {
    const bug = await loadBug('BUG-1001');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      const broken = await runScenarioCapture({
        config,
        drive: driveGeometry,
        fixture: 'broken',
        runId: 'geom-broken',
        scenario: 'compare-geometry-misalign',
        server,
      });
      const fixed = await runScenarioCapture({
        config,
        drive: driveGeometry,
        fixture: 'fixed',
        runId: 'geom-fixed',
        scenario: 'compare-geometry-misalign',
        server,
      });

      const left = geometryManifest('save-broken', -12);
      const right = geometryManifest('save-fixed', 0);
      const result = await runScenarioCompare({
        left,
        right,
        scenario: 'compare-geometry-misalign',
      });

      expect(result.layouts.sideBySide).toContain('xstack');
      expect(result.layouts.onion.length).toBeGreaterThan(0);
      expect(result.layouts.difference.length).toBeGreaterThan(0);
      expect(result.layouts.edgeOverlay.length).toBeGreaterThan(0);
      expect(result.geometryDeltas.length).toBeGreaterThan(0);

      await runScenarioAnnotate({
        config,
        eventsPath: broken.eventsPath,
        scenario: 'compare-geometry-misalign',
        suffix: 'render-broken',
        videoPath: broken.videoPath,
      });
      await runScenarioAnnotate({
        config,
        eventsPath: fixed.eventsPath,
        scenario: 'compare-geometry-misalign',
        suffix: 'render-fixed',
        videoPath: fixed.videoPath,
      });
    });
  }, 240_000);

  it('compare-contrast-text covers wipe/blink layouts', async () => {
    const bug = await loadBug('BUG-1002');
    const config = configFromBug(bug);
    await withServer(async (server) => {
      await runScenarioCapture({
        config,
        drive: driveContrast,
        fixture: 'broken',
        scenario: 'compare-contrast-text',
        server,
      });
      await runScenarioCapture({
        config,
        drive: driveContrast,
        fixture: 'fixed',
        scenario: 'compare-contrast-text',
        server,
      });
      const result = await runScenarioCompare({
        left: geometryManifest('price-broken', 0, '#888888'),
        right: geometryManifest('price-fixed', 0, '#1a1a1a'),
        scenario: 'compare-contrast-text',
      });
      expect(result.layouts.wipe.length).toBeGreaterThan(0);
      expect(result.layouts.blink.length).toBeGreaterThan(0);
    });
  }, 240_000);

  it('annotate-multi-shape covers simultaneous callouts', async () => {
    const bug = await loadBug('BUG-1004');
    const config = mergeFeatures(configFromBug(bug), {
      zoom: true,
      stackingContexts: true,
      clickViz: true,
      steps: true,
    });
    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: (session) => driveMultiShape(session, bug),
        fixture: 'broken',
        scenario: 'annotate-multi-shape',
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario: 'annotate-multi-shape',
        videoPath: capture.videoPath,
      });
      const plan = JSON.parse(await readFile(annotated.planPath, 'utf8')) as {
        annotations: Array<{ shape?: string }>;
      };
      expect(plan.annotations.length).toBeGreaterThan(0);
      await assertVideo(annotated.videoPath);
    });
  }, 180_000);

  it('package-quality packages viewer and writes quality report', async () => {
    const scenario = 'package-quality';
    const config: ReproConfig = {
      mode: 'repro',
      profile: 'controlled',
      surfaceCapture: 'page',
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      features: { steps: true, specCard: true },
      metadata: {},
    };

    await withServer(async (server) => {
      const capture = await runScenarioCapture({
        config,
        drive: async (session) => {
          await session.page.waitForTimeout(400);
        },
        fixture: 'fixed',
        scenario,
        server,
      });
      const annotated = await runScenarioAnnotate({
        config,
        eventsPath: capture.eventsPath,
        scenario,
        videoPath: capture.videoPath,
      });
      await assertVideo(annotated.videoPath, 500);
      const manifestPath = await runScenarioPackage({
        planPath: annotated.planPath,
        scenario,
        videoPath: annotated.videoPath,
      });
      const qualityPath = await writeQualityPass(scenario);
      const quality = JSON.parse(await readFile(qualityPath, 'utf8')) as {
        pass: boolean;
      };
      expect(quality.pass).toBe(true);
      expect(manifestPath.endsWith('evidence-manifest.json')).toBe(true);
    });
  }, 180_000);
});

function mergeFeatures(
  config: ReproConfig,
  features: ReproConfig['features'],
): ReproConfig {
  return {
    ...config,
    features: { ...config.features, ...features },
  };
}

function geometryManifest(
  id: string,
  dx: number,
  color = '#000000',
): CompareManifest {
  return {
    schemaVersion: 1,
    steps: [
      {
        id: `${id}-step`,
        label: 'Inspect control',
        startMs: 0,
        durationMs: 1_000,
      },
    ],
    geometry: [
      {
        testId: 'btn-save',
        path: 'main/aside/div.save-row/button',
        text: color,
        bounds: { x: 140 + dx, y: 420, w: 96, h: 36 },
        styles: { color },
      },
    ],
    environment: {
      schemaVersion: 1,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezone: 'UTC',
      playwrightVersion: '1.62.0',
      browserVersion: 'chromium',
    },
  };
}
