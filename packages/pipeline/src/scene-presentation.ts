import { appVersionLabel, type VersionOverlayOptions } from './app-version.js';
import { sceneReviewHtml } from './scene-review.js';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  validateEvidence,
  validatePresentationEdit,
  parsePlan,
  sceneSourceAt,
} from '@repro/contracts';
import { ReproConfigSchema } from '@repro/contracts/config';
import { compileScene, type SceneEvent } from '@repro/plan';
import {
  renderScene,
  selectSceneFrame,
  type SceneSourceFrame,
} from '@repro/compositor';
import { renderCheckpointImage, PRIVACY_RENDER_METHOD } from '@repro/render';
import { motionMaskEnvelopes } from '@repro/core';
import { redactText } from '@repro/core/redactor';
import {
  verifyRun,
  artifactRef,
  containedArtifact,
  writeJson,
} from './evidence-run.js';
import { compileEvidencePresentation } from './evidence-presentation.js';

export async function renderSceneEvidence(
  directory: string,
  options: { evidence?: string; treatment?: string } & VersionOverlayOptions,
) {
  const run = await verifyRun(directory);
  run.stages.presentation = {
    status: 'failed',
    durationMs: 0,
    cacheHit: false,
  };
  await writeJson(join(directory, 'run.json'), run);
  const captured = validateEvidence(
    JSON.parse(await readFile(join(directory, 'evidence.json'), 'utf8')),
  );
  const spec = options.evidence
    ? validatePresentationEdit(
        captured,
        validateEvidence(JSON.parse(await readFile(options.evidence, 'utf8'))),
      )
    : captured;
  const config = ReproConfigSchema.parse(run.environment.appliedConfiguration);
  if (config.capturePreviewUi)
    throw new Error(
      'Scene rendering requires clean capture pixels; recapture with capturePreviewUi disabled',
    );
  const index = run.artifacts.find((a) => a.kind === 'source-frame-index');
  if (!index)
    throw new Error(
      'Verified pre-normalization frames missing. Recapture this scenario; legacy runs remain available with --renderer legacy.',
    );
  const events = (await readFile(join(directory, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SceneEvent);
  const treatment = options.treatment
    ? (JSON.parse(await readFile(options.treatment, 'utf8')) as unknown)
    : undefined;
  const offset = Number(run.environment.recordingStartMs ?? 0);
  const scene = compileScene({
    spec,
    run,
    events,
    viewport: config.viewport,
    offset,
    appVersion: appVersionLabel(run, config, spec.privacy.patterns, options),
    ...(treatment ? { treatments: treatment } : {}),
  });
  const safeText = (text: string) =>
    spec.privacy.patterns.reduce(
      (value, pattern) =>
        value.replaceAll(new RegExp(pattern, 'giu'), '[redacted]'),
      redactText(text).redacted,
    );
  for (const cue of scene.cues) {
    cue.title = safeText(cue.title);
    cue.detail = safeText(cue.detail);
    if (cue.expected) cue.expected = safeText(cue.expected);
    if (cue.observed) cue.observed = safeText(cue.observed);
    for (const sample of cue.samples) sample.text = safeText(sample.text);
  }
  const raw = JSON.parse(
    await readFile(await containedArtifact(directory, index.path), 'utf8'),
  ) as SceneSourceFrame[];
  for (const frame of raw) {
    if (
      !run.artifacts.some(
        (a) =>
          a.kind === 'source-frame' &&
          a.path === frame.path &&
          a.sha256 === frame.sha256,
      )
    )
      throw new Error(`Unverified source frame: ${frame.id}`);
  }
  // Active-page cuts are part of capture provenance, never inferred by proximity.
  const cuts = events
    .filter((e) => e.kind === 'editorial.cut')
    .sort((a, b) => a.t_mono - b.t_mono);
  for (const segment of scene.segments) {
    if (segment.kind === 'play' && !segment.pageId) {
      const start = segment.sourceStartMs ?? 0;
      const inside = cuts.filter(
        (e) =>
          e.t_mono > start &&
          e.t_mono < start + segment.outDurationMs * segment.rate,
      );
      if (inside.length)
        throw new Error(
          'Scene slice does not yet support a page cut inside a playback segment; use a separate scenario step per page',
        );
      segment.pageId =
        cuts.filter((e) => e.t_mono <= start).at(-1)?.pageId ?? raw[0]?.pageId;
    }
  }
  const source: SceneSourceFrame[] = [
    ...raw,
    ...run.observations.flatMap((o) =>
      o.kind === 'screenshot' && o.status === 'passed' && o.artifact
        ? [
            {
              id: o.id,
              path: o.artifact,
              pageId: o.pageId,
              timeMs: o.timeMs,
              sha256:
                run.artifacts.find((a) => a.path === o.artifact)?.sha256 ?? '',
              checkpoint: o.id,
            },
          ]
        : [],
    ),
  ];
  const duration = scene.segments.reduce((n, s) => n + s.outDurationMs, 0);
  const selected = new Set<string>();
  for (let i = 0; i < Math.ceil((duration * 30) / 1000); i++) {
    const frame = selectSceneFrame(
      scene,
      source,
      Math.min(duration - 0.001, (i * 1000) / 30),
    );
    if (frame) selected.add(frame.source.id);
  }
  const masks = motionMaskEnvelopes(
    events
      .filter((e) =>
        ['probe.redaction.mask', 'redaction.mask'].includes(e.kind),
      )
      .flatMap((e) => {
        const p = e.payload;
        return ['x', 'y', 'width', 'height'].every(
          (k) => typeof p[k] === 'number',
        )
          ? [
              {
                group: `${e.pageId}/${String(p.selector)}`,
                x: Number(p.x),
                y: Number(p.y),
                width: Number(p.width),
                height: Number(p.height),
              },
            ]
          : [];
      }),
  );
  if (
    spec.privacy.selectors.some(
      (selector) =>
        !events.some(
          (e) =>
            ['probe.redaction.mask', 'redaction.mask'].includes(e.kind) &&
            e.payload.selector === selector,
        ),
    )
  )
    throw new Error('Required privacy mask observations missing');
  const legacy = compileEvidencePresentation(
    spec,
    run,
    config.viewport,
    offset,
  );
  const plan = parsePlan({
    schemaVersion: 1,
    viewport: config.viewport,
    annotations: legacy.annotations.map((a) => {
      const cue = scene.cues.find((c) =>
        [`step-${a.id}`, `marker-${a.id}`].includes(c.id),
      );
      return cue
        ? { ...a, timeRange: { start: cue.startMs, end: cue.endMs } }
        : a;
    }),
    chapters: [],
    redactionRects: masks,
    segments: [],
    timeline: legacy.timeline,
    metadata: {
      durationMs: duration,
      generatedAtEpoch: 0,
      redactionMethod: PRIVACY_RENDER_METHOD,
    },
  });
  const outputDir = join(directory, 'presentations', `scene-${randomUUID()}`);
  await mkdir(join(outputDir, 'assets'), { recursive: true });
  const sanitized: SceneSourceFrame[] = [];
  for (const frame of source.filter((f) => selected.has(f.id))) {
    const path = join(
      outputDir,
      'assets',
      `${createHash('sha256').update(frame.id).digest('hex')}.png`,
    );
    await renderCheckpointImage({
      image: await containedArtifact(directory, frame.path),
      plan: { ...plan, annotations: [], chapters: [] },
      output: path,
    });
    const artifact = await artifactRef(directory, path, 'sanitized-source');
    const named = join(outputDir, 'assets', `${artifact.sha256}.png`);
    await copyFile(path, named);
    sanitized.push({
      ...frame,
      path: named,
      originalSha256: frame.sha256,
      sha256: artifact.sha256,
    });
  }
  const repairs: { attempt: number; reason: string; height: number }[] = [];
  const renderWithRepairs = async () => {
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        return await renderScene({
          scene,
          sources: sanitized,
          outDir: outputDir,
        });
      } catch (error) {
        if (
          attempt === 3 ||
          !String(error).includes('No readable space for required group')
        )
          throw error;
        repairs.push({
          attempt: attempt + 1,
          reason: 'Measured annotation groups need a taller reserved gutter',
          height: scene.output.height,
        });
        await copyFile(
          join(outputDir, 'composition.html'),
          join(outputDir, `draft-${attempt + 1}.html`),
        );
        await writeJson(join(outputDir, 'presentation-repairs.json'), repairs);
        scene.output.height += 240;
      }
    }
    throw new Error('Presentation repair limit reached');
  };
  const rendered = await renderWithRepairs();
  await writeJson(join(outputDir, 'plan.json'), plan);
  await writeJson(join(outputDir, 'evidence.json'), spec);
  await writeJson(
    join(outputDir, 'treatment.json'),
    treatment ?? { schemaVersion: '1.0.0', treatments: [] },
  );
  const quality = {
    schemaVersion: '1.0.0',
    status: 'passed',
    renderer: 'hyperframes',
    checks: [
      'verified-source-identities',
      'measured-checkpoint-geometry',
      'sanitized-source-pixels',
      'frame-seeking',
      'font-readiness',
      'all-frame-card-layout',
    ],
    visualAcceptance: 'pending',
  };
  await writeJson(join(outputDir, 'scene-quality.json'), quality);
  const stills = [];
  for (const cp of spec.checkpoints) {
    const observation = run.observations.find(
      (o) =>
        o.checkpoint === cp.id &&
        o.kind === 'screenshot' &&
        o.status === 'passed',
    );
    const hold = scene.segments.find((s) => s.checkpoint === observation?.id);
    if (!hold) continue;
    const frame = Math.min(
      rendered.frames.length - 1,
      Math.round(
        ((hold.outStartMs + Math.min(400, hold.outDurationMs / 2)) * 30) / 1000,
      ),
    );
    const path = join(outputDir, `${cp.id}.png`);
    await copyFile(
      join(outputDir, 'frames', `frame_${String(frame).padStart(6, '0')}.png`),
      path,
    );
    stills.push(await artifactRef(directory, path, 'presentation-image'));
  }
  const artifacts = await Promise.all([
    artifactRef(directory, rendered.outputPath, 'presentation-video'),
    artifactRef(
      directory,
      join(outputDir, 'plan.json'),
      `presentation-key:scene-${rendered.receipt.sceneSha256}`,
    ),
    artifactRef(
      directory,
      join(outputDir, 'evidence.json'),
      'presentation-spec',
    ),
    artifactRef(directory, join(outputDir, 'scene.json'), 'presentation-scene'),
    artifactRef(
      directory,
      join(outputDir, 'composition.html'),
      'presentation-composition',
    ),
    ...sanitized.map((f) =>
      artifactRef(directory, f.path, 'presentation-source'),
    ),
    artifactRef(
      directory,
      join(outputDir, 'frame-map.json'),
      'presentation-frame-map',
    ),
    artifactRef(
      directory,
      join(outputDir, 'scene-quality.json'),
      'presentation-quality',
    ),
    artifactRef(
      directory,
      join(outputDir, 'render-receipt.json'),
      'presentation-environment',
    ),
  ]);
  run.artifacts = run.artifacts
    .filter((a) => !a.kind.startsWith('presentation-') && a.kind !== 'captions')
    .concat(artifacts, stills);
  run.stages.presentation = {
    status: 'passed',
    durationMs: rendered.receipt.renderMs,
    cacheHit: false,
  };
  await writeJson(join(directory, 'run.json'), run);
  // Local-only review exposes mapped source time; exported media still uses the existing audit.
  const escaped = JSON.stringify({
    frames: rendered.frames,
    events,
    observations: run.observations,
  }).replaceAll('<', '\\u003c');
  const review = sceneReviewHtml(escaped);
  await import('node:fs/promises').then((fs) =>
    fs.writeFile(join(outputDir, 'review.html'), review),
  );
  run.artifacts.push(
    await artifactRef(
      directory,
      join(outputDir, 'review.html'),
      'presentation-review',
    ),
  );
  await writeJson(join(directory, 'run.json'), run);
  return {
    outputPath: rendered.outputPath,
    receipt: rendered.receipt,
    directory: outputDir,
    review: join(outputDir, 'review.html'),
    quality,
    sourceTiming: sceneSourceAt(scene, 0),
    cacheHit: false,
  };
}
