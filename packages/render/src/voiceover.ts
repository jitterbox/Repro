import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

import type { Segment } from '@repro/plan';
import type { TimeRange } from '@repro/core';

/** Canonical narration document — single source for VO, VTT, transcript. */
export interface NarrationDocument {
  readonly language: string;
  readonly model: 'kokoro-82m' | 'silence-mock';
  readonly pronunciationOverrides?: Readonly<Record<string, string>>;
  readonly scriptHash: string;
  readonly segments: readonly VoiceoverSegment[];
  readonly speed: number;
  readonly voice: string;
}

export interface VoiceoverSegment {
  readonly id: string;
  readonly text: string;
  readonly timeRange: TimeRange;
}

export interface SynthesizedVoiceover {
  readonly id: string;
  readonly audioPath: string;
  readonly model: NarrationDocument['model'];
  readonly timeRange: TimeRange;
}

export interface SynthesizeVoiceoverInput {
  readonly ffmpegPath?: string;
  readonly kokoroCommand?: string;
  readonly outDir: string;
  readonly segments: readonly VoiceoverSegment[];
  readonly voice?: string;
}

export function buildNarrationDocument(input: {
  readonly language?: string;
  readonly model?: NarrationDocument['model'];
  readonly pronunciationOverrides?: Readonly<Record<string, string>>;
  readonly segments: readonly VoiceoverSegment[];
  readonly speed?: number;
  readonly voice?: string;
}): NarrationDocument {
  const script = input.segments.map((s) => s.text).join('\n');
  return {
    language: input.language ?? 'en',
    model: input.model ?? 'kokoro-82m',
    ...(input.pronunciationOverrides === undefined
      ? {}
      : { pronunciationOverrides: input.pronunciationOverrides }),
    scriptHash: sha256Hex(script),
    segments: input.segments,
    speed: input.speed ?? 1,
    voice: input.voice ?? 'af_heart',
  };
}

/**
 * Synthesize per-segment audio with Kokoro-82M when available.
 * Falls back to ffmpeg silence of planned duration (tests / CI without weights).
 */
export async function synthesizeVoiceoverSegments(
  input: SynthesizeVoiceoverInput,
): Promise<readonly SynthesizedVoiceover[]> {
  await mkdir(input.outDir, { recursive: true });
  const ffmpegPath = input.ffmpegPath ?? 'ffmpeg';
  const voice = input.voice ?? 'af_heart';

  return Promise.all(
    input.segments.map(async (segment) => {
      const audioPath = join(input.outDir, `${segment.id}.wav`);
      const usedKokoro = await tryKokoroSynthesize({
        command: input.kokoroCommand ?? 'kokoro',
        outputPath: audioPath,
        text: segment.text,
        voice,
      });

      if (!usedKokoro) {
        await writeSilenceWav({
          durationMs: segment.timeRange.end - segment.timeRange.start,
          ffmpegPath,
          outputPath: audioPath,
        });
      }

      return {
        audioPath,
        id: segment.id,
        model: usedKokoro ? 'kokoro-82m' : 'silence-mock',
        timeRange: segment.timeRange,
      };
    }),
  );
}

export async function writeVtt(
  path: string,
  segments: readonly VoiceoverSegment[],
): Promise<void> {
  const cues = segments.map((segment) => {
    return [
      segment.id,
      `${vttTime(segment.timeRange.start)} --> ${vttTime(segment.timeRange.end)}`,
      segment.text,
    ].join('\n');
  });

  await writeFile(path, `WEBVTT\n\n${cues.join('\n\n')}\n`);
}

export async function writeTranscript(
  path: string,
  document: NarrationDocument,
): Promise<void> {
  const body = document.segments
    .map((s) => `[${vttTime(s.timeRange.start)}] ${s.text}`)
    .join('\n');
  await writeFile(
    path,
    [
      `# Transcript`,
      `model: ${document.model}`,
      `voice: ${document.voice}`,
      `language: ${document.language}`,
      `speed: ${String(document.speed)}`,
      `scriptHash: ${document.scriptHash}`,
      '',
      body,
      '',
    ].join('\n'),
  );
}

/** Audio duration drives video segment length via tpad freeze. */
export async function tpadExtensionFromDurations(input: {
  readonly ffprobePath?: string;
  readonly synthesized: readonly SynthesizedVoiceover[];
}): Promise<readonly Segment[]> {
  const segments = await Promise.all(
    input.synthesized.map(async (item) => {
      const durationMs = await probeDurationMs(
        item.audioPath,
        input.ffprobePath ?? 'ffprobe',
      );
      const planned = item.timeRange.end - item.timeRange.start;
      const extra = Math.max(0, durationMs - planned);

      return {
        factor: 1,
        id: `voiceover-pad-${item.id}`,
        kind: 'pause',
        timeRange: {
          end: item.timeRange.end + extra,
          start: item.timeRange.end,
        },
      } satisfies Segment;
    }),
  );

  return segments.filter((segment) => {
    return segment.timeRange.end > segment.timeRange.start;
  });
}

async function tryKokoroSynthesize(input: {
  readonly command: string;
  readonly outputPath: string;
  readonly text: string;
  readonly voice: string;
}): Promise<boolean> {
  try {
    await run(input.command, [
      '--voice',
      input.voice,
      '--output',
      input.outputPath,
      '--text',
      input.text,
    ]);
    return true;
  } catch {
    return false;
  }
}

function writeSilenceWav(input: {
  readonly durationMs: number;
  readonly ffmpegPath: string;
  readonly outputPath: string;
}): Promise<void> {
  const seconds = Math.max(0.001, input.durationMs / 1_000).toString();
  return run(input.ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=24000:cl=mono',
    '-t',
    seconds,
    input.outputPath,
  ]).then(() => undefined);
}

async function probeDurationMs(
  path: string,
  ffprobePath: string,
): Promise<number> {
  const output = await run(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]);

  const seconds = Number.parseFloat(output.trim());
  return Number.isFinite(seconds) ? seconds * 1_000 : 0;
}

function run(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args]);
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`${command} exited with ${String(code)}: ${stderr}`));
    });
  });
}

function vttTime(ms: number): string {
  const wholeMs = Math.max(0, Math.round(ms));
  const milliseconds = wholeMs % 1_000;
  const totalSeconds = Math.floor(wholeMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${padMs(milliseconds)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function padMs(value: number): string {
  return value.toString().padStart(3, '0');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
