import { createHash } from 'node:crypto';
import {
  operationMetadata,
  runProcess as executeProcess,
} from '@jitterbox/repro-core';
import { scanOcrBatches, OCR_POLICY_VERSION } from './ocr-batch.js';
import { spawn } from 'node:child_process';
import {
  access,
  copyFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';

import type { Rect } from '@jitterbox/repro-contracts/plan';
import type { ReproConfig } from '@jitterbox/repro-core';

import { DEFAULT_CANARY_SECRET } from './redaction/canaries.js';
import { createPresidioLikeRedactor } from './redaction/presidio.js';

export interface OcrHit {
  readonly text: string;
  readonly confidence: number;
  readonly rect?: Rect;
  readonly detector?: string;
  readonly mode?: string;
  readonly frame?: number;
  readonly occurrences?: readonly number[];
}

export interface OcrAuditOptions {
  readonly adapter?: OcrAdapter;
  readonly cacheDir?: string;
  readonly diagnosticsDir?: string;
  readonly sourceFrameMap?: readonly unknown[];
  readonly artifactPath?: string;
  readonly onProgress?: (progress: {
    phase: string;
    completed: number;
    total: number;
  }) => void;
  readonly captionsPath?: string;
  readonly eventsPath?: string;
  readonly ffmpegPath?: string;
  readonly ocrCommand?: string;
  readonly requireAudit?: boolean;
  readonly patterns?: readonly string[];
}

export interface OcrAdapter {
  scan(input: OcrAdapterInput): Promise<OcrAdapterResult>;
}

export interface OcrAdapterInput {
  readonly cacheDir?: string;
  readonly onProgress?: OcrAuditOptions['onProgress'];
  readonly frameDir: string;
  readonly framePaths: readonly string[];
  readonly patterns?: readonly string[];
  readonly sidecarPath: string;
  readonly videoPath: string;
  readonly captionsPath?: string;
  readonly eventsPath?: string;
}

export interface OcrAdapterResult {
  readonly audited: boolean;
  readonly source?: 'frame-ocr';
  readonly framesScanned?: number;
  readonly toolVersion?: string;
  readonly stats?: Record<string, number>;
  readonly hits: readonly OcrHit[];
}

export class GateError extends Error {
  public readonly hits: readonly OcrHit[];
  public reportPath?: string | undefined;
  public code = 'OCR_AUDIT_UNAVAILABLE';
  public timings?: Record<string, number>;

  public constructor(message: string, hits: readonly OcrHit[]) {
    super(message);
    this.name = 'GateError';
    this.hits = hits;
  }
}

export async function auditOutputOcr(path: string): Promise<readonly OcrHit[]> {
  return runOcrAudit(path, { requireAudit: false });
}

export async function runOcrAudit(
  videoPath: string,
  options: OcrAuditOptions = {},
): Promise<readonly OcrHit[]> {
  return (await inspectOcrAudit(videoPath, options)).hits;
}

/** Private diagnostics are retained even when a strict export is blocked. */
export async function inspectOcrAudit(
  videoPath: string,
  options: OcrAuditOptions = {},
) {
  const started = performance.now();
  const frameDir = await mkdtemp(join(tmpdir(), 'repro-ocr-'));
  const diagnosticsDir = options.diagnosticsDir
    ? await mkdtemp(await privatePrefix(options.diagnosticsDir))
    : undefined;
  const reportPath = diagnosticsDir
    ? join(diagnosticsDir, 'report.json')
    : undefined;
  const timings: Record<string, number> = {};
  let hits: readonly OcrHit[] = [],
    audited = false;
  let stats: Record<string, number> = {},
    toolVersion: string | undefined;
  let sha256: string | undefined;
  let failureDetail: { code: string; message: string } | undefined;
  let frameTimes: (number | null)[] = [];
  try {
    sha256 = createHash('sha256')
      .update(await readFile(videoPath))
      .digest('hex');
    const decodeStarted = performance.now();
    const framePaths = await sampleFrames({
      ffmpegPath: options.ffmpegPath ?? 'ffmpeg',
      frameDir,
      videoPath,
    });
    timings.decodeMs = performance.now() - decodeStarted;
    try {
      const probe = await executeProcess('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_frames',
        '-show_entries',
        'frame=best_effort_timestamp_time',
        '-of',
        'json',
        videoPath,
      ]);
      frameTimes = (
        JSON.parse(probe) as {
          frames: { best_effort_timestamp_time?: string }[];
        }
      ).frames.map((f) =>
        f.best_effort_timestamp_time === undefined
          ? null
          : Number(f.best_effort_timestamp_time) * 1000,
      );
    } catch {
      /* Missing timing is reported as unknown; it cannot establish source identity. */
    }
    const input = adapterInput(videoPath, frameDir, framePaths, options);
    const scanStarted = performance.now();
    const results = await Promise.all(
      adapters(
        options.adapter,
        options.ocrCommand ?? process.env.REPRO_OCR_COMMAND,
      ).map((adapter) => adapter.scan(input)),
    );
    timings.ocrMs = performance.now() - scanStarted;
    hits = uniqueHits(results.flatMap((r) => r.hits));
    const pixel = results.find(
      (r) =>
        r.audited &&
        r.source === 'frame-ocr' &&
        r.framesScanned === framePaths.length,
    );
    audited = framePaths.length > 0 && !!pixel;
    stats = pixel?.stats ?? { frames: framePaths.length };
    toolVersion = pixel?.toolVersion;
    if (diagnosticsDir) {
      for (const frame of new Set(
        hits.flatMap((h) => (h.frame === undefined ? [] : [h.frame])),
      )) {
        const source = framePaths[frame];
        if (!source) continue;
        const path = join(diagnosticsDir, `frame-${frame}.png`);
        await copyFile(source, path);
        await chmod(path, 0o600);
      }
    }
    if (options.requireAudit && !audited)
      throw new GateError(
        'OCR audit is required for strict redaction but could not run',
        hits,
      );
    if (
      createHash('sha256')
        .update(await readFile(videoPath))
        .digest('hex') !== sha256
    ) {
      const failure = new GateError('Artifact changed during audit', []);
      failure.code = 'OCR_ARTIFACT_CHANGED';
      throw failure;
    }
    timings.totalMs = performance.now() - started;
    if (reportPath) await writeReport('complete');
    return { hits, audited, reportPath, timings, stats, toolVersion, sha256 };
  } catch (error) {
    timings.totalMs = performance.now() - started;
    const failure =
      error instanceof GateError
        ? error
        : new GateError(
            'OCR audit could not complete; inspect the private audit report',
            hits,
          );
    failureDetail = {
      code: failure.code,
      message: error instanceof Error ? error.message : 'Unknown OCR failure',
    };
    failure.reportPath = reportPath;
    failure.timings = timings;
    if (reportPath) await writeReport('incomplete');
    throw failure;
  } finally {
    operationMetadata({
      phases: Object.fromEntries(
        Object.entries(timings).map(([key, value]) => [`audit.${key}`, value]),
      ),
      metrics: Object.fromEntries(
        Object.entries(stats)
          .filter(([key]) => !['workers', 'ocrMs'].includes(key))
          .map(([key, value]) => [`audit.${key}`, value]),
      ),
      ...(reportPath ? { reportPath } : {}),
    });
    await rm(frameDir, { force: true, recursive: true });
  }
  async function writeReport(status: string) {
    if (!reportPath || !diagnosticsDir) return;
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          schemaVersion: '1.0.0',
          kind: 'repro.privacy-audit',
          status,
          passed: status === 'complete' && audited && hits.length === 0,
          audited,
          artifact: resolve(options.artifactPath ?? videoPath),
          sha256,
          policyVersion: OCR_POLICY_VERSION,
          toolVersion,
          ...(failureDetail ? { failure: failureDetail } : {}),
          modes: [3, 11],
          timings,
          stats,
          findings: hits.map((h) => ({
            ...h,
            outputMs:
              h.frame === undefined ? null : (frameTimes[h.frame] ?? null),
            source:
              h.frame === undefined
                ? null
                : (options.sourceFrameMap?.[h.frame] ?? null),
            reviewImage:
              h.frame === undefined
                ? null
                : join(diagnosticsDir, `frame-${h.frame}.png`),
            occurrences:
              h.occurrences?.map((frame) => ({
                frame,
                outputMs: frameTimes[frame] ?? null,
                source: options.sourceFrameMap?.[frame] ?? null,
              })) ?? [],
          })),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}
async function privatePrefix(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return join(directory, 'audit-');
}

export async function enforceOcrAudit(input: {
  readonly path: string;
  readonly redaction?: ReproConfig['redaction'];
  readonly captionsPath?: string;
  readonly eventsPath?: string;
  readonly requireAudit?: boolean;
  readonly patterns?: readonly string[];
  readonly diagnosticsDir?: string;
  readonly cacheDir?: string;
  readonly artifactPath?: string;
  readonly sourceFrameMap?: readonly unknown[];
  readonly onProgress?: OcrAuditOptions['onProgress'];
}): Promise<readonly OcrHit[]> {
  const requireAudit = input.requireAudit ?? input.redaction?.strict === true;
  const audit = await inspectOcrAudit(input.path, {
    diagnosticsDir:
      input.diagnosticsDir ?? join(dirname(input.path), '.repro-audits'),
    ...(input.cacheDir ? { cacheDir: input.cacheDir } : {}),
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    ...(input.sourceFrameMap ? { sourceFrameMap: input.sourceFrameMap } : {}),
    ...(input.onProgress ? { onProgress: input.onProgress } : {}),
    ...(input.captionsPath === undefined
      ? {}
      : { captionsPath: input.captionsPath }),
    ...(input.eventsPath === undefined ? {} : { eventsPath: input.eventsPath }),
    requireAudit,
    ...(input.patterns ? { patterns: input.patterns } : {}),
  });

  const hits = audit.hits;
  if (input.redaction?.strict === true && hits.length > 0) {
    const error = new GateError(
      'OCR audit found text after strict redaction; inspect the private audit report',
      hits,
    );
    error.code = 'OCR_PII_DETECTED';
    error.reportPath = audit.reportPath;
    error.timings = audit.timings;
    throw error;
  }

  if (requireAudit) {
    const sha256 = createHash('sha256')
      .update(await readFile(input.path))
      .digest('hex');
    if (sha256 !== audit.sha256) {
      const failure = new GateError('Artifact changed during audit', []);
      failure.code = 'OCR_ARTIFACT_CHANGED';
      failure.reportPath = audit.reportPath;
      failure.timings = audit.timings;
      throw failure;
    }
    const policyHash = createHash('sha256')
      .update(
        JSON.stringify({
          redaction: input.redaction ?? { strict: true },
          patterns: input.patterns ?? [],
        }),
      )
      .digest('hex');
    await writeFile(
      `${input.path}.audit.json`,
      JSON.stringify(
        {
          schemaVersion: 1,
          sha256,
          policyHash,
          policyVersion: OCR_POLICY_VERSION,
          pageSegmentationModes: [3, 11],
          source: 'frame-ocr',
          tool: 'tesseract',
          toolVersion: audit.toolVersion ?? 'unknown',
          auditedAt: new Date().toISOString(),
          passed: hits.length === 0,
        },
        null,
        2,
      ),
    );
  }
  return hits;
}

/** Every extracted output frame is OCR'd; identical pixels share a result. */
export class TesseractOcrAdapter implements OcrAdapter {
  constructor(readonly workers = Number(process.env.REPRO_OCR_WORKERS ?? 2)) {
    if (!Number.isSafeInteger(workers) || workers < 1 || workers > 8)
      throw new RangeError(
        'REPRO_OCR_WORKERS must be an integer between 1 and 8',
      );
  }
  async scan(input: OcrAdapterInput): Promise<OcrAdapterResult> {
    return scanOcrBatches(input, this.workers);
  }
}

export class HeuristicOcrAdapter implements OcrAdapter {
  public async scan(input: OcrAdapterInput): Promise<OcrAdapterResult> {
    const samples = [
      textSample(basename(input.videoPath), false),
      ...(await sidecarSamples(input.sidecarPath)),
      ...(await captionSamples(input)),
      ...(await eventSamples(input.eventsPath)),
      ...(await frameSamples(input.framePaths)),
    ];

    return {
      audited: false,
      hits: uniqueHits(samples.flatMap((sample) => hitsFromText(sample.text))),
    };
  }
}

export class CommandOcrAdapter implements OcrAdapter {
  public constructor(private readonly command: string) {}

  public async scan(input: OcrAdapterInput): Promise<OcrAdapterResult> {
    const result = await runProcess({
      command: this.command,
      env: commandEnv(input),
      shell: true,
    });

    if (!result.ok) {
      return { audited: false, hits: [] };
    }

    return {
      audited: true,
      hits: uniqueHits([
        ...safeParseHits(result.output),
        ...hitsFromText(result.output),
      ]),
    };
  }
}

function parseHits(text: string): readonly OcrHit[] {
  const parsed: unknown = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((item) => {
    return isOcrHit(item) ? [item] : [];
  });
}

function isOcrHit(value: unknown): value is OcrHit {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OcrHit>;
  return (
    typeof candidate.text === 'string' &&
    typeof candidate.confidence === 'number'
  );
}

interface TextSample {
  readonly audited: boolean;
  readonly text: string;
}

interface ProcessResult {
  readonly ok: boolean;
  readonly output: string;
}

interface RunProcessInput {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly shell?: boolean;
}

interface SampleFramesInput {
  readonly ffmpegPath: string;
  readonly frameDir: string;
  readonly videoPath: string;
}

function adapters(
  adapter: OcrAdapter | undefined,
  command: string | undefined,
): readonly OcrAdapter[] {
  const base = adapter ?? new TesseractOcrAdapter();
  return [
    base,
    new HeuristicOcrAdapter(),
    ...(command === undefined ? [] : [new CommandOcrAdapter(command)]),
  ];
}

function adapterInput(
  videoPath: string,
  frameDir: string,
  framePaths: readonly string[],
  options: OcrAuditOptions,
): OcrAdapterInput {
  return {
    frameDir,
    framePaths,
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.patterns ? { patterns: options.patterns } : {}),
    sidecarPath: `${videoPath}.ocr.json`,
    videoPath,
    ...(options.captionsPath === undefined
      ? {}
      : { captionsPath: options.captionsPath }),
    ...(options.eventsPath === undefined
      ? {}
      : { eventsPath: options.eventsPath }),
  };
}

async function sampleFrames(
  input: SampleFramesInput,
): Promise<readonly string[]> {
  if (!(await pathExists(input.videoPath))) {
    return [];
  }

  const outputPattern = join(input.frameDir, 'frame-%06d.png');
  const result = await runProcess({
    args: [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input.videoPath,
      '-fps_mode',
      'passthrough',
      '-q:v',
      '3',
      outputPattern,
    ],
    command: input.ffmpegPath,
  });

  if (!result.ok) {
    return [];
  }

  return framePaths(input.frameDir);
}

async function framePaths(frameDir: string): Promise<readonly string[]> {
  const entries = await readdir(frameDir);
  return entries
    .filter((entry) => extname(entry).toLowerCase() === '.png')
    .sort()
    .map((entry) => join(frameDir, entry));
}

async function sidecarSamples(path: string): Promise<readonly TextSample[]> {
  const text = await readOptional(path);
  return text === undefined ? [] : [textSample(text, true)];
}

async function captionSamples(
  input: OcrAdapterInput,
): Promise<readonly TextSample[]> {
  const paths = uniqueStrings([
    ...(input.captionsPath === undefined ? [] : [input.captionsPath]),
    ...(await siblingCaptionPaths(input.videoPath)),
  ]);
  const texts = await Promise.all(
    paths.map(async (path) => textSample(await readOptional(path), true)),
  );

  return texts.filter((sample) => sample.audited);
}

async function eventSamples(
  eventsPath: string | undefined,
): Promise<readonly TextSample[]> {
  if (eventsPath === undefined) {
    return [];
  }

  const text = await readOptional(eventsPath);
  return text === undefined ? [] : [textSample(text, true)];
}

async function frameSamples(
  framePaths: readonly string[],
): Promise<readonly TextSample[]> {
  const samples = framePaths.map((path) => {
    return textSample(basename(path), false);
  });
  const textPaths = uniqueStrings(framePaths.flatMap(frameTextCandidates));
  const textSamples = await Promise.all(
    textPaths.map(async (path) => textSample(await readOptional(path), true)),
  );

  return [...samples, ...textSamples.filter((sample) => sample.audited)];
}

function frameTextCandidates(path: string): readonly string[] {
  const extension = extname(path);
  return [path + '.txt', path.slice(0, -extension.length) + '.txt'];
}

async function siblingCaptionPaths(
  videoPath: string,
): Promise<readonly string[]> {
  const dir = dirname(videoPath);
  const video = parse(videoPath).name.toLowerCase();

  try {
    const entries = await readdir(dir);
    return entries
      .filter((entry) => isRelatedCaption(entry, video))
      .map((entry) => join(dir, entry));
  } catch {
    return [];
  }
}

function isRelatedCaption(entry: string, videoName: string): boolean {
  const parsed = parse(entry);
  const extension = parsed.ext.toLowerCase();
  const name = parsed.name.toLowerCase();

  if (!['.vtt', '.srt'].includes(extension)) {
    return false;
  }

  return (
    name.startsWith(videoName) ||
    name.includes('caption') ||
    name.includes('subtitle') ||
    name.includes('transcript')
  );
}

function safeParseHits(text: string): readonly OcrHit[] {
  try {
    return parseHits(text);
  } catch {
    return [];
  }
}

function hitsFromText(text: string): readonly OcrHit[] {
  const redactor = createPresidioLikeRedactor();
  const piiHits = redactor.redactText(text).hits.map((hit) => {
    return { confidence: 0.65, text: hit.text, detector: hit.entity };
  });

  return [...piiHits, ...canaryHits(text)];
}

function canaryHits(text: string): readonly OcrHit[] {
  const pattern = /\brepro-canary-secret-[a-z0-9-]+\b/giu;
  const hits = [...text.matchAll(pattern)].map((match) => {
    return { confidence: 1, text: match[0] };
  });

  if (text.includes(DEFAULT_CANARY_SECRET)) {
    return uniqueHits([
      ...hits,
      { confidence: 1, text: DEFAULT_CANARY_SECRET },
    ]);
  }

  return hits;
}

function uniqueHits(hits: readonly OcrHit[]): readonly OcrHit[] {
  const keyed = new Map<string, OcrHit>();

  for (const hit of hits) {
    keyed.set(
      JSON.stringify([hit.text, hit.detector, hit.mode, hit.frame, hit.rect]),
      hit,
    );
  }

  return [...keyed.values()];
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function textSample(text: string | undefined, audited: boolean): TextSample {
  return { audited: audited && text !== undefined, text: text ?? '' };
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function commandEnv(input: OcrAdapterInput): NodeJS.ProcessEnv {
  return {
    ...process.env,
    REPRO_OCR_FRAME_DIR: input.frameDir,
    REPRO_OCR_VIDEO: input.videoPath,
    ...(input.captionsPath === undefined
      ? {}
      : { REPRO_OCR_CAPTIONS: input.captionsPath }),
    ...(input.eventsPath === undefined
      ? {}
      : { REPRO_OCR_EVENTS: input.eventsPath }),
  };
}

function runProcess(input: RunProcessInput): Promise<ProcessResult> {
  if (!input.shell)
    return executeProcess(
      input.command,
      input.args ?? [],
      input.env ? { env: input.env } : {},
    ).then(
      (output) => ({ ok: true, output }),
      (error: unknown) => ({
        ok: false,
        output: error instanceof Error ? error.message : String(error),
      }),
    );
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args ?? [], {
      env: input.env,
      shell: input.shell ?? false,
    });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      resolve({ ok: false, output: error.message });
    });
    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        output: Buffer.concat(chunks).toString('utf8'),
      });
    });
  });
}
