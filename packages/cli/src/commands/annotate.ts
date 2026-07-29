import { join } from 'node:path';

import { evidenceFilename } from '@repro/alm';
import { closeCompositor, renderCards } from '@repro/compositor';
import { validateAgainst } from '@repro/contracts';
import {
  REPRO_PLAN_VERSION,
  annotationsToVisualCues,
  buildPlan,
  buildSlate,
} from '@repro/plan';
import {
  REPRO_RENDER_VERSION,
  probeMediaDurationMs,
  renderPlan,
} from '@repro/render';

import {
  loadConfig,
  readEvents,
  readFrames,
  readJson,
  writeJson,
} from './io.js';
import {
  artifactEnding,
  cliStageCacheKey,
  defaultStageRoot,
  matchingVerifiedStage,
  writeCliStage,
} from './stages.js';

import type { SlateMode } from '@repro/compositor';
import type {
  EventRecord,
  HashInput,
  JsonValue,
  ReproConfig,
  StageManifest,
} from '@repro/core';
import type { ReproPlan, SlateEnvironment } from '@repro/plan';
import type { RenderPlanResult } from '@repro/render';

export interface AnnotateCommandOptions {
  readonly config: string;
  readonly events: string;
  readonly frames?: string;
  readonly outDir: string;
  readonly outputName?: string;
  readonly planOut?: string;
  readonly resume?: string;
  readonly video: string;
}

export interface AnnotateCommandResult {
  readonly plan: ReproPlan;
  readonly planPath: string;
  readonly render: RenderPlanResult;
  readonly resumed?: 'compose' | 'encode';
}

export async function annotateCommand(
  options: AnnotateCommandOptions,
): Promise<AnnotateCommandResult> {
  const { config } = await loadConfig(options.config);
  const events = await readEvents(options.events);
  const frames =
    options.frames === undefined ? [] : await readFrames(options.frames);
  const rootDir = options.resume ?? defaultStageRoot(options.outDir);
  const composeKey = composeStageKey({ config, options });
  const encodeKey = encodeStageKey({ composeKey, config, options });
  const encoded = await matchingEncodeStage(options.resume, encodeKey);

  if (encoded !== null) {
    return encoded;
  }

  const planPath = options.planOut ?? join(options.outDir, 'plan.json');
  const composed = await matchingComposeStage(options.resume, composeKey);
  const bugId = metadataString(config.metadata, 'bugId') ??
    metadataString(config.metadata, 'issueId');
  const mediaDurationMs = await probeMediaDurationMs(options.video);
  const plan =
    composed === null
      ? buildPlan({
          config,
          events,
          frames,
          viewport: config.viewport,
          ...(bugId === undefined ? {} : { bugId }),
          ...(mediaDurationMs === undefined
            ? {}
            : { mediaDurationMs }),
        })
      : composed.plan;

  if (composed === null) {
    await writeJson(planPath, plan);
    const timelineCheck = validateAgainst('timeline', plan.timeline);
    if (!timelineCheck.valid) {
      throw new Error(
        `timeline validation failed: ${timelineCheck.errors?.join('; ') ?? ''}`,
      );
    }
    await writeCliStage({
      artifacts: [planPath],
      cacheKey: composeKey,
      config,
      inputs: composeInputs(options),
      rootDir,
      stage: 'compose',
      versions: composeVersions(),
    });
  }

  const activePlanPath = composed?.planPath ?? planPath;
  const outputName =
    options.outputName ??
    namedOutput(config, bugId);
  const compositor = await renderCompositorLayers({
    config,
    events,
    outDir: options.outDir,
    plan,
    ...(bugId === undefined ? {} : { bugId }),
  });
  const cues = annotationsToVisualCues(plan.annotations);
  const visualCuesPath = join(options.outDir, 'visual-cues.json');
  await writeJson(visualCuesPath, cues);
  for (const cue of cues) {
    const cueCheck = validateAgainst('visual-cue', cue);
    if (!cueCheck.valid) {
      throw new Error(
        `visual-cue validation failed for ${cue.id}: ` +
          `${cueCheck.errors?.join('; ') ?? ''}`,
      );
    }
  }
  const render = await renderPlan({
    outDir: options.outDir,
    plan,
    video: options.video,
    outputName,
    ...(compositor.slatePath === undefined
      ? {}
      : { slatePath: compositor.slatePath }),
    ...(compositor.overlays.length === 0
      ? {}
      : { compositorInputs: compositor.overlays }),
  });
  const layerManifest = {
    schemaVersion: '1.0.0' as const,
    layers: [
      ...(compositor.slatePath === undefined
        ? []
        : [
            {
              cueId: 'slate',
              source: compositor.slatePath,
              kind: 'png' as const,
              startMs: 0,
              endMs: plan.timeline.beats.find((beat) => beat.id === 'slate')
                ?.outDurationMs ?? 2200,
              zIndex: 10,
              expectedAlphaMin: 0.9,
            },
          ]),
      ...compositor.overlays.map((overlay, index) => ({
        cueId: `compositor-${String(index)}`,
        source: overlay.path,
        kind: 'png' as const,
        startMs: overlay.startMs,
        endMs: overlay.endMs,
        zIndex: 7,
        enable:
          `between(t,${(overlay.startMs / 1000).toFixed(3)},` +
          `${(overlay.endMs / 1000).toFixed(3)})`,
        expectedAlphaMin: 0.2,
      })),
      {
        cueId: 'overlay.ass',
        source: render.assPath,
        kind: 'ass' as const,
        startMs: 0,
        endMs: plan.metadata.durationMs,
        zIndex: 8,
      },
    ],
  };
  const layerManifestPath = join(options.outDir, 'rendered-layer-manifest.json');
  const layerCheck = validateAgainst('rendered-layer', layerManifest);
  if (!layerCheck.valid) {
    throw new Error(
      `rendered-layer validation failed: ${layerCheck.errors?.join('; ') ?? ''}`,
    );
  }
  await writeJson(layerManifestPath, layerManifest);

  await writeCliStage({
    artifacts: [
      activePlanPath,
      visualCuesPath,
      layerManifestPath,
      render.assPath,
      render.outputPath,
    ],
    cacheKey: encodeKey,
    config,
    inputs: encodeInputs({ composeKey, options }),
    rootDir,
    stage: 'encode',
    versions: encodeVersions(),
  });

  return {
    plan,
    planPath: activePlanPath,
    render,
  };
}

async function matchingEncodeStage(
  rootDir: string | undefined,
  cacheKey: string,
): Promise<AnnotateCommandResult | null> {
  if (rootDir === undefined) {
    return null;
  }

  const result = await matchingVerifiedStage({
    cacheKey,
    rootDir,
    stages: ['compose', 'encode'],
  });

  if (result?.manifest === null || result?.path === null || result === null) {
    return null;
  }

  return resumedAnnotateResult(result.manifest);
}

async function matchingComposeStage(
  rootDir: string | undefined,
  cacheKey: string,
): Promise<{ readonly plan: ReproPlan; readonly planPath: string } | null> {
  if (rootDir === undefined) {
    return null;
  }

  const result = await matchingVerifiedStage({
    cacheKey,
    rootDir,
    stages: ['compose'],
  });

  if (result?.manifest === null || result === null) {
    return null;
  }

  const planPath = artifactEnding(result.manifest, 'plan.json');
  if (planPath === undefined) {
    return null;
  }

  return {
    plan: (await readJson(planPath)) as ReproPlan,
    planPath,
  };
}

async function resumedAnnotateResult(
  manifest: StageManifest,
): Promise<AnnotateCommandResult | null> {
  const planPath = artifactEnding(manifest, 'plan.json');
  const outputPath = artifactEnding(manifest, '.mp4');
  const assPath = artifactEnding(manifest, '.ass') ?? '';

  if (planPath === undefined || outputPath === undefined) {
    return null;
  }

  return {
    plan: (await readJson(planPath)) as ReproPlan,
    planPath,
    render: {
      assPath,
      filterComplex: '',
      outputPath,
      timelinePath: assPath.replace(/\.ass$/, '.timeline.json'),
    },
    resumed: 'encode',
  };
}

function composeStageKey(input: {
  readonly config: ReproConfig;
  readonly options: AnnotateCommandOptions;
}): string {
  return cliStageCacheKey({
    config: input.config,
    inputs: composeInputs(input.options),
    versions: composeVersions(),
  });
}

function encodeStageKey(input: {
  readonly composeKey: string;
  readonly config: ReproConfig;
  readonly options: AnnotateCommandOptions;
}): string {
  return cliStageCacheKey({
    config: input.config,
    inputs: encodeInputs(input),
    versions: encodeVersions(),
  });
}

function composeInputs(options: AnnotateCommandOptions): HashInput {
  return {
    events: options.events,
    frames: options.frames ?? null,
  };
}

function encodeInputs(input: {
  readonly composeKey: string;
  readonly options: AnnotateCommandOptions;
}): HashInput {
  return {
    composeKey: input.composeKey,
    outputName: input.options.outputName ?? null,
    video: input.options.video,
  };
}

function composeVersions(): Record<string, string> {
  return {
    '@repro/plan': REPRO_PLAN_VERSION,
  };
}

function encodeVersions(): Record<string, string> {
  return {
    '@repro/render': REPRO_RENDER_VERSION,
  };
}

function namedOutput(
  config: ReproConfig,
  bugId: string | undefined,
): string {
  if (bugId === undefined) {
    return 'annotated.mp4';
  }

  const slug =
    metadataString(config.metadata, 'slug') ??
    metadataString(config.metadata, 'specTitle') ??
    'repro';
  const env = metadataString(config.metadata, 'env') ?? config.profile;
  const sha =
    metadataString(config.metadata, 'sha') ??
    metadataString(config.metadata, 'buildSha') ??
    '0000000';

  try {
    return evidenceFilename({
      env,
      issueId: bugId,
      recordedAt: new Date(),
      sha: sha.length >= 7 ? sha : `${sha}0000000`.slice(0, 7),
      slug,
    });
  } catch {
    return `${bugId}_repro.mp4`;
  }
}

function metadataString(
  metadata: Readonly<Record<string, JsonValue>>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function renderCompositorLayers(input: {
  readonly config: ReproConfig;
  readonly events: readonly EventRecord[];
  readonly outDir: string;
  readonly plan: ReproPlan;
  readonly bugId?: string;
}): Promise<{
  readonly slatePath?: string;
  readonly overlays: readonly {
    readonly path: string;
    readonly startMs: number;
    readonly endMs: number;
  }[];
}> {
  const wantsSlate = input.plan.timeline.beats.some(
    (beat) => beat.id === 'slate',
  );
  const compositorAnnotations = input.plan.annotations.filter(
    (annotation) =>
      annotation.renderer === 'compositor' &&
      annotation.component !== 'slate',
  );

  if (!wantsSlate && compositorAnnotations.length === 0) {
    return { overlays: [] };
  }

  const environment = environmentFromEvents(input.events);
  const cards: import('@repro/compositor').CardSpec[] = [];
  let slateCardId: string | undefined;

  if (wantsSlate && environment !== null) {
    try {
      const title =
        metadataString(input.config.metadata, 'title') ??
        metadataString(input.config.metadata, 'System.Title') ??
        metadataString(input.config.metadata, 'almTitle');
      const slate = buildSlate({
        config: input.config,
        environment,
        ...(input.bugId === undefined ? {} : { bugId: input.bugId }),
        ...(title === undefined ? {} : { title }),
        durationMs: input.plan.metadata.durationMs,
        stepCount: input.plan.chapters.length,
      });
      const mode = toSlateMode(slate.mode);
      if (mode !== undefined) {
        slateCardId = 'slate';
        cards.push({
          id: 'slate',
          kind: 'slate',
          props: {
            schemaVersion: slate.schemaVersion,
            mode,
            bugId: slate.bugId,
            title: slate.title,
            browser: slate.browser,
            os: slate.os,
            viewport: slate.viewport,
            appLabel: slate.appLabel,
            holdMs: slate.holdMs,
            dissolveMs: slate.dissolveMs,
            ...(slate.profile === undefined ? {} : { profile: slate.profile }),
            ...(slate.profileChip === undefined
              ? {}
              : { profileChip: slate.profileChip }),
            ...(slate.locale === undefined ? {} : { locale: slate.locale }),
            ...(slate.timezone === undefined
              ? {}
              : { timezone: slate.timezone }),
            ...(slate.build === undefined ? {} : { build: slate.build }),
            ...(slate.capturedAt === undefined
              ? {}
              : { capturedAt: slate.capturedAt }),
            ...(slate.stepCount === undefined
              ? {}
              : { stepCount: slate.stepCount }),
            ...(slate.durationMs === undefined
              ? {}
              : { durationMs: slate.durationMs }),
            ...(slate.outcome === undefined ? {} : { outcome: slate.outcome }),
          },
        });
      }
    } catch {
      // Fail closed for filing is handled by gates; local annotate continues.
    }
  }

  for (const annotation of compositorAnnotations) {
    const card = cardFromAnnotation(annotation);
    if (card !== undefined) {
      cards.push(card);
    }
  }

  if (cards.length === 0) {
    return { overlays: [] };
  }

  try {
    const rendered = await renderCards({
      outDir: join(input.outDir, 'compositor'),
      cards,
    });
    const byId = new Map(rendered.map((entry) => [entry.id, entry.path]));
    const slatePath =
      slateCardId === undefined ? undefined : byId.get(slateCardId);
    const overlays = compositorAnnotations.flatMap((annotation) => {
      const path = byId.get(annotation.id);
      if (path === undefined) {
        return [];
      }
      const range = annotation.outTimeRange ?? annotation.timeRange;
      return [
        {
          path,
          startMs: range.start,
          endMs: range.end,
        },
      ];
    });
    return {
      overlays,
      ...(slatePath === undefined ? {} : { slatePath }),
    };
  } catch {
    return { overlays: [] };
  } finally {
    await closeCompositor();
  }
}

function cardFromAnnotation(
  annotation: ReproPlan['annotations'][number],
): import('@repro/compositor').CardSpec | undefined {
  const component = annotation.component;
  if (component === 'console-toast') {
    const level = consoleLevelFromLabel(annotation.label);
    return {
      id: annotation.id,
      kind: 'console-toast',
      props: {
        level,
        message: annotation.plate?.label ?? annotation.label,
      },
    };
  }
  if (component === 'outcome-pair') {
    return {
      id: annotation.id,
      kind: 'outcome-pair',
      props: {
        expected: annotation.plate?.measurement ?? 'Expected behavior',
        actual: annotation.plate?.label ?? annotation.label,
      },
    };
  }
  if (component === 'vitals-hud') {
    return {
      id: annotation.id,
      kind: 'vitals-hud',
      props: { slot: 'tr' },
    };
  }
  if (component === 'roi-magnifier' && annotation.anchor?.bbox !== undefined) {
    const bbox = annotation.anchor.bbox;
    return {
      id: annotation.id,
      kind: 'roi-magnifier',
      props: {
        magnification: 2.5,
        sourceRect: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
        label: annotation.label,
      },
    };
  }
  if (component === 'freeze-banner') {
    return {
      id: annotation.id,
      kind: 'freeze-banner',
      props: {
        label: annotation.plate?.label ?? annotation.label,
      },
    };
  }
  if (component === 'delta-caption') {
    return {
      id: annotation.id,
      kind: 'delta-caption',
      props: {
        caption: annotation.plate?.label ?? annotation.label,
        deltaClass: 'geometry',
      },
    };
  }
  return undefined;
}

function consoleLevelFromLabel(
  label: string,
): 'error' | 'warn' | 'info' | 'log' {
  const lower = label.toLowerCase();
  if (lower.startsWith('error') || lower.includes('exception')) {
    return 'error';
  }
  if (lower.startsWith('warn')) {
    return 'warn';
  }
  if (lower.startsWith('info')) {
    return 'info';
  }
  return 'log';
}


function toSlateMode(mode: string): SlateMode | undefined {
  if (mode === 'repro' || mode === 'demo' || mode === 'compare') {
    return mode;
  }
  return undefined;
}

function environmentFromEvents(
  events: readonly EventRecord[],
): SlateEnvironment | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.kind !== 'capture.environment') {
      continue;
    }
    const payload = asRecord(event.payload);
    const manifest = asRecord(payload?.manifest);
    if (manifest === null) {
      continue;
    }
    const browserLabel = stringField(manifest, 'browserLabel');
    const osLabel = stringField(manifest, 'osLabel');
    const viewport = asRecord(manifest.viewport);
    if (
      browserLabel === undefined ||
      osLabel === undefined ||
      viewport === null
    ) {
      continue;
    }
    const width = numberField(viewport, 'width');
    const height = numberField(viewport, 'height');
    const dsf = numberField(viewport, 'deviceScaleFactor') ?? 1;
    if (width === undefined || height === undefined) {
      continue;
    }
    const locale = stringField(manifest, 'locale');
    const timezone = stringField(manifest, 'timezone');
    const build = stringField(manifest, 'build');
    return {
      browserLabel,
      osLabel,
      viewport: {
        width,
        height,
        deviceScaleFactor: dsf,
      },
      ...(locale === undefined ? {} : { locale }),
      ...(timezone === undefined ? {} : { timezone }),
      ...(build === undefined ? {} : { build }),
    };
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
