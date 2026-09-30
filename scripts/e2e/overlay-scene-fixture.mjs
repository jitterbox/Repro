/** Test-only translation of synthetic diagnostic events to shipped scene components.
 * No generated observation is ever exported as captured bug proof.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { buildPlan } from '../../packages/plan/dist/index.js';
import { parseScenePlan } from '../../packages/contracts/dist/index.js';
import { renderScene } from '../../packages/compositor/dist/index.js';

export async function renderOverlayFixture({ config, events, source, folder }) {
  const plan = buildPlan({
    config,
    events,
    frames: [],
    viewport: config.viewport,
  });
  const manifest = JSON.parse(await readFile(join(source, 'run.json'), 'utf8'));
  const mapArtifact = manifest.artifacts.find(
    (a) => a.kind === 'presentation-frame-map',
  );
  assert.ok(
    mapArtifact,
    'Render the source fixture before testing synthetic overlays',
  );
  const mapPath = join(source, mapArtifact.path);
  const mapping = JSON.parse(await readFile(mapPath, 'utf8'));
  const selected =
    mapping.find((f) => f.segmentId.startsWith('hold-')) ?? mapping.at(-1);
  const duration = plan.metadata.durationMs;
  const cues = [];
  for (const annotation of plan.annotations) {
    if (
      annotation.component === 'progress-rail' ||
      annotation.component === 'redaction'
    )
      continue;
    const range = annotation.outTimeRange ?? annotation.timeRange;
    const box = annotation.anchor?.bbox;
    const target = box
      ? { x: box.x, y: box.y, width: box.w, height: box.h }
      : undefined;
    const kind =
      annotation.component === 'roi-magnifier'
        ? 'magnifier'
        : annotation.component === 'outcome-pair'
          ? 'outcome'
          : annotation.component === 'cursor-path' ||
              annotation.component === 'click-ripple'
            ? 'pointer'
            : annotation.component === 'target-ring'
              ? 'highlight'
              : 'data-panel';
    const segment = annotation.cursorSegment;
    if (kind === 'pointer') {
      assert.ok(segment || box, 'Pointer feedback requires recorded geometry');
    }
    cues.push({
      id: annotation.id,
      kind,
      title: annotation.plate?.label ?? annotation.label ?? annotation.feature,
      detail: annotation.plate?.kicker ?? '',
      startMs: Math.max(0, range.start),
      endMs: Math.min(duration, range.end),
      layer: kind === 'pointer' ? 55 : kind === 'highlight' ? 30 : 50,
      ...(target && ['magnifier', 'highlight'].includes(kind)
        ? { target }
        : {}),
      ...(kind === 'magnifier' ? { magnification: 2.5 } : {}),
      ...(kind === 'outcome'
        ? {
            expected: config.metadata.expected,
            observed: config.metadata.actual,
          }
        : {}),
      ...(kind === 'pointer'
        ? {
            action: 'click',
            points: segment
              ? [
                  { ...segment.from, timeMs: range.start },
                  { ...segment.to, timeMs: range.start },
                ]
              : [
                  {
                    x: box.x + box.w / 2,
                    y: box.y + box.h / 2,
                    timeMs: range.start,
                  },
                ],
          }
        : {}),
    });
  }
  const scene = parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: 1280, height: 720 },
    sourceOrigin: { x: 24, y: 96 },
    output: { width: 1688, height: 2400, fps: 30 },
    layout: { overlayPanels: 'never', retireSteps: false },
    segments: [
      {
        id: 'synthetic-diagnostic-hold',
        kind: 'hold',
        sourceStartMs: selected.sourceMs,
        rate: 0,
        outStartMs: 0,
        outDurationMs: duration,
      },
    ],
    cues,
  });
  const rendered = await renderScene({
    scene,
    outDir: folder,
    sources: [
      {
        id: selected.sourceFrameId,
        path: join(dirname(mapPath), selected.asset),
        sha256: selected.sanitizedSha256,
        pageId: selected.pageId,
        timeMs: selected.sourceMs,
      },
    ],
  });
  assert.equal(
    rendered.receipt.layoutFramesChecked,
    rendered.receipt.frameCount,
  );
  assert.equal(rendered.receipt.randomSeekPassed, true);
  const planPath = join(folder, 'event-plan.json');
  await writeFile(planPath, JSON.stringify(plan, null, 2));
  return {
    plan,
    planPath,
    scene,
    render: rendered,
    sourcePath: join(dirname(mapPath), selected.asset),
  };
}
