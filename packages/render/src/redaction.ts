import { createHash } from 'node:crypto';
import { mapBounded, runProcess as executeProcess } from '@repro/core';
import { spawn } from 'node:child_process';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, parse } from 'node:path';

import type { Rect } from '@repro/plan';
import type { ReproConfig } from '@repro/core';

import { DEFAULT_CANARY_SECRET } from './redaction/canaries.js';
import { createPresidioLikeRedactor } from './redaction/presidio.js';

export interface OcrHit {
  readonly text: string;
  readonly confidence: number;
  readonly rect?: Rect;
}

export interface OcrAuditOptions {
  readonly adapter?: OcrAdapter;
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
  readonly hits: readonly OcrHit[];
}

export class GateError extends Error {
  public readonly hits: readonly OcrHit[];

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
  const frameDir = await mkdtemp(join(tmpdir(), 'repro-ocr-'));

  try {
    const command = options.ocrCommand ?? process.env.REPRO_OCR_COMMAND;
    const framePaths = await sampleFrames({
      ffmpegPath: options.ffmpegPath ?? 'ffmpeg',
      frameDir,
      videoPath,
    });
    const input = adapterInput(videoPath, frameDir, framePaths, options);
    const results = await Promise.all(
      adapters(options.adapter, command).map((adapter) => adapter.scan(input)),
    );
    const hits = uniqueHits(results.flatMap((result) => result.hits));
    const audited =
      framePaths.length > 0 &&
      results.some(
        (result) =>
          result.audited &&
          result.source === 'frame-ocr' &&
          result.framesScanned === framePaths.length,
      );

    if (options.requireAudit === true && !audited) {
      throw new GateError(
        'OCR audit is required for strict redaction but could not run',
        hits,
      );
    }

    return hits;
  } finally {
    await rm(frameDir, { force: true, recursive: true });
  }
}

export async function enforceOcrAudit(input: {
  readonly path: string;
  readonly redaction?: ReproConfig['redaction'];
  readonly captionsPath?: string;
  readonly eventsPath?: string;
  readonly requireAudit?: boolean;
  readonly patterns?: readonly string[];
}): Promise<readonly OcrHit[]> {
  const auditedBytes = await readFile(input.path).catch(() => {
    throw new GateError(
      'Required output artifact is missing or unreadable',
      [],
    );
  });
  const auditedHash = createHash('sha256').update(auditedBytes).digest('hex');
  const requireAudit = input.requireAudit ?? input.redaction?.strict === true;
  const hits = await runOcrAudit(input.path, {
    ...(input.captionsPath === undefined
      ? {}
      : { captionsPath: input.captionsPath }),
    ...(input.eventsPath === undefined ? {} : { eventsPath: input.eventsPath }),
    requireAudit,
    ...(input.patterns ? { patterns: input.patterns } : {}),
  });

  if (input.redaction?.strict === true && hits.length > 0) {
    throw new GateError('OCR audit found text after strict redaction', hits);
  }

  if (requireAudit) {
    const sha256 = createHash('sha256')
      .update(await readFile(input.path))
      .digest('hex');
    if (sha256 !== auditedHash)
      throw new GateError('Artifact changed during audit', []);
    const toolVersion = await runProcess({
      command: 'tesseract',
      args: ['--version'],
    });
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
          policyVersion: '1.1.0',
          pageSegmentationModes: [3, 11],
          source: 'frame-ocr',
          tool: 'tesseract',
          toolVersion: toolVersion.output.split('\n')[0],
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
    const version = await runProcess({
      command: 'tesseract',
      args: ['--version'],
    });
    if (!version.ok || !input.framePaths.length)
      return { audited: false, hits: [] };
    const uniqueFrames = new Map<string, string>();
    for (const path of input.framePaths) {
      const hash = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
      if (!uniqueFrames.has(hash)) uniqueFrames.set(hash, path);
    }
    // Deduplicate before scheduling: duplicate frames cannot start duplicate OCR jobs.
    const results = await mapBounded(
      [...uniqueFrames.values()],
      this.workers,
      async (path) => {
        const texts: string[] = [];
        // Both layouts are mandatory, including when another worker reports a hit.
        for (const mode of ['3', '11']) {
          const result = await runProcess({
            command: 'tesseract',
            args: [path, 'stdout', '--psm', mode],
            env: { ...process.env, OMP_THREAD_LIMIT: '1' },
          });
          if (!result.ok)
            throw new GateError('A required frame OCR worker failed', []);
          texts.push(result.output);
        }
        return texts.flatMap((text) => [
          ...hitsFromText(text),
          ...(input.patterns ?? [])
            .filter((pattern) => text.includes(pattern))
            .map((text) => ({ text, confidence: 1 })),
        ]);
      },
    );
    const hits = results.flat();
    return {
      audited: true,
      source: 'frame-ocr',
      framesScanned: input.framePaths.length,
      toolVersion: version.output.split('\n')[0] ?? 'unknown',
      hits: uniqueHits(hits),
    };
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
    return { confidence: 0.65, text: hit.text };
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
    keyed.set(hit.text, hit);
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
