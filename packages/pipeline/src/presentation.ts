import { appVersionLabel, type VersionOverlayOptions } from './app-version.js';
import { renderSceneEvidence } from './scene-presentation.js';
import { screenshotForBounds } from './checkpoint-geometry.js';
import { readFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cliStageCacheKey } from './commands/stages.js';
import { compileEvidencePresentation } from './evidence-presentation.js';
import { parsePlan } from '@repro/contracts';
import {
  renderPlan,
  renderCheckpointImage,
  PRIVACY_RENDER_METHOD,
} from '@repro/render';
import {
  validateEvidence,
  validatePresentationEdit,
  hitTestOutline,
} from '@repro/contracts';
import { ReproConfigSchema } from '@repro/contracts/config';
import {
  artifactRef,
  containedArtifact,
  verifyRun,
  writeJson,
} from './evidence-run.js';
import {
  withFileLock,
  enumerateFonts,
  runProcess,
  motionMaskEnvelopes,
} from '@repro/core';

export async function renderEvidence(
  directory: string,
  options: {
    evidence?: string;
    renderer?: 'legacy' | 'hyperframes';
    treatment?: string;
  } & VersionOverlayOptions = {},
) {
  if (options.treatment && options.renderer !== 'hyperframes')
    throw new Error('Treatments require the hyperframes renderer');
  return withFileLock(join(directory, 'render.lock'), () =>
    options.renderer === 'hyperframes'
      ? renderSceneEvidence(directory, options)
      : renderEvidenceLocked(directory, options),
  );
}
async function renderEvidenceLocked(
  directory: string,
  options: { evidence?: string } & VersionOverlayOptions,
) {
  const run = await verifyRun(directory);
  const recording = run.artifacts.find(
    (artifact) => artifact.kind === 'recording',
  );
  if (!recording) throw new Error('Required recording artifact missing');
  const capturedSpec = validateEvidence(
    JSON.parse(await readFile(join(directory, 'evidence.json'), 'utf8')),
  );
  const spec = options.evidence
    ? validatePresentationEdit(
        capturedSpec,
        validateEvidence(JSON.parse(await readFile(options.evidence, 'utf8'))),
      )
    : capturedSpec;
  const config = ReproConfigSchema.parse(run.environment.appliedConfiguration);
  const offset = Number(run.environment.recordingStartMs ?? 0);
  const {
    timeline,
    annotations,
    outputDuration,
    cues: visualCues,
  } = compileEvidencePresentation(
    spec,
    run,
    config.viewport,
    offset,
    true,
    appVersionLabel(run, config, spec.privacy.patterns, options),
  );
  const events = (await readFile(join(directory, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          kind: string;
          pageId: string;
          payload: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            selector?: string;
          };
        },
    );
  const redactionRects = motionMaskEnvelopes(
    events
      .filter(
        (e) => e.kind === 'probe.redaction.mask' || e.kind === 'redaction.mask',
      )
      .flatMap((e, index) => {
        const { x, y, width, height } = e.payload;
        return typeof x === 'number' &&
          typeof y === 'number' &&
          typeof width === 'number' &&
          typeof height === 'number'
          ? [
              {
                group: `${e.pageId}/${e.payload.selector ?? index}`,
                x,
                y,
                width,
                height,
              },
            ]
          : [];
      }),
  );
  const plan = parsePlan({
    schemaVersion: 1,
    viewport: config.viewport,
    annotations,
    chapters: [],
    redactionRects,
    segments: [],
    timeline,
    metadata: {
      durationMs: outputDuration,
      generatedAtEpoch: 0,
      redactionMethod: PRIVACY_RENDER_METHOD,
    },
    narrationSegments: annotations
      .filter((a) => a.component === 'step-badge')
      .map((a) => ({ id: a.id, text: a.label, timeRange: a.timeRange })),
  });
  const [fonts, ffmpegVersion] = await Promise.all([
    enumerateFonts(),
    runProcess('ffmpeg', ['-version']),
  ]);
  // Presentation may run on a different machine or after font/tool upgrades.
  // Capture provenance cannot describe the renderer currently producing pixels.
  const presentationEnvironment = {
    nodeVersion: process.version,
    ffmpegVersion,
    fontManifest: fonts,
    ...(fonts.length === 0 || fonts.some((font) => !font.sha256)
      ? { unknownFontIdentity: randomUUID() }
      : {}),
  };
  const identity = cliStageCacheKey({
    config,
    inputs: JSON.stringify({
      plan,
      source: run.artifacts.find((a) => a.kind === 'recording')?.sha256,
      checkpoints: run.artifacts.filter((a) => a.kind === 'checkpoint'),
      presentationEnvironment,
    }),
    versions: {
      ffmpeg: ffmpegVersion,
      node: process.version,
    },
  });
  const previous = run.stages.presentation;
  const outputDir = join(directory, 'presentations', identity);
  await mkdir(outputDir, { recursive: true });
  if (
    previous?.status === 'passed' &&
    run.artifacts.some((a) => a.kind === `presentation-key:${identity}`)
  )
    return { directory: outputDir, cacheHit: true };
  const started = performance.now();
  await writeJson(join(outputDir, 'plan.json'), plan);
  await writeJson(join(outputDir, 'visual-cues.json'), visualCues);
  await writeJson(join(outputDir, 'evidence.json'), spec);
  await writeJson(join(outputDir, 'environment.json'), presentationEnvironment);
  // Use checkpoint pixels, not a later movie frame. Cues come from the same plan.
  const stills = [];
  const checkpointHolds: {
    path: string;
    width: number;
    height: number;
    startMs: number;
    endMs: number;
    checkpoint: string;
    observation: string;
  }[] = [];
  for (const cp of run.observations.filter(
    (o) => o.kind === 'screenshot' && o.artifact && o.status === 'passed',
  )) {
    if (!cp.artifact) throw new Error('Checkpoint image is missing');
    const definition = spec.checkpoints.find(
      (checkpoint) => checkpoint.id === cp.checkpoint,
    );
    const measuredIds = new Set(
      run.observations
        .filter((o) => screenshotForBounds(o, run.observations)?.id === cp.id)
        .map((o) => o.id),
    );
    const hasOutcome = run.observations.some(
      (o) =>
        o.checkpoint === cp.checkpoint &&
        o.kind === 'assertion' &&
        o.status === 'passed' &&
        o.data?.designated === true &&
        o.pageId === cp.pageId &&
        o.timeMs <= cp.timeMs,
    );
    const cues = plan.annotations.filter(
      (annotation) =>
        annotation.id === 'title' ||
        annotation.id === 'app-version' ||
        annotation.id === definition?.step ||
        measuredIds.has(annotation.id) ||
        (annotation.anchor?.evidenceRef !== undefined &&
          measuredIds.has(annotation.anchor.evidenceRef)) ||
        (hasOutcome && annotation.id === 'outcome'),
    );
    const path = join(outputDir, `${cp.checkpoint}.png`);
    await renderCheckpointImage({
      image: join(directory, cp.artifact),
      plan: { ...plan, annotations: cues },
      output: path,
    });
    stills.push(await artifactRef(directory, path, 'presentation-image'));
    const hold = timeline.beats.find(
      (beat) => beat.id === `read-${definition?.step}`,
    );
    if (hold) {
      // Multiple checkpoints in one step remain separate stills; the last one
      // is its concluding reading hold. Each step should express one proof beat.
      const existing = checkpointHolds.findIndex(
        (value) => value.startMs === hold.outStartMs,
      );
      if (existing !== -1) checkpointHolds.splice(existing, 1);
      checkpointHolds.push({
        path,
        width: config.viewport.width,
        height: config.viewport.height,
        startMs: hold.outStartMs,
        // A terminal outcome is presented from its measured checkpoint, not an
        // older last screencast frame. Include the closing gap and outcome bed.
        endMs:
          hasOutcome &&
          definition?.step === run.steps.at(-1)?.id &&
          definition?.timing !== 'transient'
            ? outputDuration
            : hold.outStartMs + hold.outDurationMs,
        checkpoint: cp.checkpoint,
        observation: cp.id,
      });
    }
  }
  // These stills already passed the same redaction and cue renderer as exports.
  // Full-frame opaque overlays are limited to explicit presentation holds;
  // original-timing playback remains the untouched normalized recording.
  const rendered = await renderPlan({
    video: await containedArtifact(directory, recording.path),
    plan,
    outDir: outputDir,
    outputName: 'proof.mp4',
    compositorInputs: checkpointHolds,
  });
  await writeJson(
    join(outputDir, 'checkpoint-holds.json'),
    checkpointHolds.map(({ path, ...hold }) => ({
      ...hold,
      image: relative(outputDir, path),
    })),
  );
  for (const observation of run.observations) {
    const diagnostic = hitTestOutline(observation);
    if (!diagnostic || !observation.artifact) continue;
    const step = run.steps.find(
      (s) => s.startMs <= observation.timeMs && s.endMs >= observation.timeMs,
    );
    const template = plan.annotations.find((a) => a.id === 'title');
    if (!template) throw new Error('Presentation title definition missing');
    const path = join(outputDir, `diagnostic-${observation.id}.png`);
    await renderCheckpointImage({
      image: join(directory, observation.artifact),
      output: path,
      plan: {
        ...plan,
        annotations: [
          ...plan.annotations.filter(
            (a) =>
              a.id === 'title' || a.id === 'app-version' || a.id === step?.id,
          ),
          {
            ...template,
            id: observation.id,
            component: 'target-ring',
            feature: 'clickViz',
            label: `${diagnostic.label} · observation ${observation.id}`,
            bounds: diagnostic.bounds,
            shape: 'rect',
            anchor: {
              bbox: {
                x: diagnostic.bounds.x,
                y: diagnostic.bounds.y,
                w: diagnostic.bounds.width,
                h: diagnostic.bounds.height,
              },
              evidenceRef: observation.id,
            },
          },
          {
            ...template,
            id: `${observation.id}-label`,
            label: diagnostic.label,
            fontSize: 22,
            bounds: {
              x: 24,
              y: config.viewport.height - 152,
              width: config.viewport.width - 48,
              height: 32,
            },
          },
          {
            ...template,
            id: `${observation.id}-reference`,
            label: `Point sample; measured element bounds · observation ${observation.id}`,
            fontSize: 14,
            bounds: {
              x: 24,
              y: config.viewport.height - 110,
              width: config.viewport.width - 48,
              height: 24,
            },
          },
        ],
      },
    });
    stills.push(await artifactRef(directory, path, 'presentation-image'));
  }
  const artifacts = await Promise.all([
    artifactRef(
      directory,
      join(outputDir, 'visual-cues.json'),
      'presentation-cues',
    ),
    artifactRef(
      directory,
      join(outputDir, 'checkpoint-holds.json'),
      'presentation-holds',
    ),
    artifactRef(
      directory,
      join(outputDir, 'environment.json'),
      'presentation-environment',
    ),
    artifactRef(directory, rendered.outputPath, 'presentation-video'),
    artifactRef(
      directory,
      join(outputDir, 'evidence.json'),
      'presentation-spec',
    ),
    artifactRef(directory, join(outputDir, 'captions.vtt'), 'captions'),
    artifactRef(
      directory,
      join(outputDir, 'plan.json'),
      `presentation-key:${identity}`,
    ),
  ]);
  run.artifacts = run.artifacts
    .filter((a) => !a.kind.startsWith('presentation-') && a.kind !== 'captions')
    .concat(artifacts, stills);
  run.stages.presentation = {
    status: 'passed',
    durationMs: performance.now() - started,
    cacheHit: false,
  };
  await writeJson(join(directory, 'run.json'), run);
  return { ...rendered, cacheHit: false };
}
