import { withFileLock } from '@jitterbox/repro-core';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseScenePlan, type RunManifest } from '@jitterbox/repro-contracts';
import { renderSceneComparison, type ComparisonPane } from '@jitterbox/repro-compositor';
import {
  verifyRun,
  containedArtifact,
  writeJson,
  artifactRef,
} from './evidence-run.js';
import { compareEvidence } from './comparison.js';

/** A local comparison draft. Audited paired scene packaging remains a separate gate. */
async function renderScenePairLocked(
  beforeDirectory: string,
  afterDirectory: string,
  observational = false,
) {
  const before = await verifyRun(beforeDirectory),
    after = await verifyRun(afterDirectory);
  if (
    before.scenario.id !== after.scenario.id ||
    !before.scenario.executableHash ||
    before.scenario.executableHash !== after.scenario.executableHash ||
    !before.scenario.testCase ||
    before.scenario.testCase !== after.scenario.testCase
  )
    throw new Error(
      'Scene comparison requires the same committed scenario and test case',
    );
  if (before.variant.role !== 'before' || after.variant.role !== 'after')
    throw new Error('Before and after roles required');
  if (
    !observational &&
    !(await compareEvidence(beforeDirectory, afterDirectory)).ok
  )
    throw new Error('Verified comparison evidence incomplete');
  const pane = async (
    directory: string,
    run: RunManifest,
  ): Promise<ComparisonPane> => {
    if (run.stages.presentation?.status !== 'passed')
      throw new Error('Render each scene successfully before comparison');
    const sceneRef = run.artifacts.find((a) => a.kind === 'presentation-scene'),
      composition = run.artifacts.find(
        (a) => a.kind === 'presentation-composition',
      );
    if (!sceneRef || !composition)
      throw new Error('Both runs need scene compositions');
    const scene = parseScenePlan(
      JSON.parse(
        await readFile(
          await containedArtifact(directory, sceneRef.path),
          'utf8',
        ),
      ),
    );
    return {
      encoding: scene.encoding,
      label: run.variant.label,
      width: scene.output.width,
      height: scene.output.height,
      composition: await readFile(
        await containedArtifact(directory, composition.path),
        'utf8',
      ),
      assets: await Promise.all(
        run.artifacts
          .filter((a) => a.kind === 'presentation-source')
          .map(async (a) => ({
            url: `assets/${a.sha256}.png`,
            sha256: a.sha256,
            path: await containedArtifact(directory, a.path),
          })),
      ),
      beats: scene.segments.map((s) => ({
        id: s.checkpoint
          ? `checkpoint:${run.observations.find((o) => o.id === s.checkpoint)?.checkpoint}:${s.id === 'outcome' ? 'outcome' : 'hold'}`
          : s.id,
        startMs: s.outStartMs,
        durationMs: s.outDurationMs,
      })),
    };
  };
  const result = await renderSceneComparison({
    a: await pane(beforeDirectory, before),
    b: await pane(afterDirectory, after),
    mode: observational ? 'observational' : 'verified',
    outDir: join(afterDirectory, 'presentations', `comparison-${randomUUID()}`),
  });
  const readMap = async (directory: string, run: RunManifest) => {
    const a = run.artifacts.find((a) => a.kind === 'presentation-frame-map');
    if (!a) throw new Error('Missing source mapping');
    return JSON.parse(
      await readFile(await containedArtifact(directory, a.path), 'utf8'),
    ) as unknown[];
  };
  const a = await readMap(beforeDirectory, before),
    b = await readMap(afterDirectory, after);
  const mapping = result.frames.map((f) => ({
    ...f,
    a: { ...f.a, source: a[f.a.outputFrame] },
    b: { ...f.b, source: b[f.b.outputFrame] },
  }));
  await writeJson(
    join(dirname(result.outputPath), 'comparison-frame-map.json'),
    mapping,
  );
  after.artifacts.push(
    await artifactRef(
      afterDirectory,
      result.outputPath,
      'scene-comparison-draft',
    ),
    await artifactRef(
      afterDirectory,
      join(dirname(result.outputPath), 'comparison-frame-map.json'),
      'scene-comparison-frame-map',
    ),
  );
  await writeJson(join(afterDirectory, 'run.json'), after);
  return {
    outputPath: result.outputPath,
    receipt: result.receipt,
    frameMap: join(dirname(result.outputPath), 'comparison-frame-map.json'),
    exportStatus: 'local-draft',
  };
}

export async function renderScenePair(
  beforeDirectory: string,
  afterDirectory: string,
  observational = false,
) {
  return withFileLock(join(afterDirectory, 'render.lock'), () =>
    renderScenePairLocked(beforeDirectory, afterDirectory, observational),
  );
}
