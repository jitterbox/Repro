import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { EvidenceSpec, Observation, RunManifest } from '@repro/contracts';
import { runProcess } from '@repro/core';
import type { CapturedEvent } from './interaction-events.js';

interface Frame {
  path: string;
  pageId: string;
  timeMs: number;
}
/** A deterministic selection over captured pixels. No new browser screenshot is taken. */
export function selectEventFrame(
  checkpoint: EvidenceSpec['checkpoints'][number],
  segments: RunManifest['segments'],
  events: CapturedEvent[],
  frames: Frame[],
) {
  const request = checkpoint.frame;
  if (!request) throw new Error('Missing event-frame selection');
  const segment = segments.find(
    (s) => s.id === request.segment && s.status === 'passed',
  );
  if (!segment)
    throw new Error('Required capture segment missing or incomplete');
  const candidates = events.filter(
    (event) =>
      event.pageId === segment.pageId &&
      event.t_mono >= segment.startMs &&
      event.t_mono <= segment.endMs &&
      event.kind === request.event.kind &&
      Object.entries(request.event.match).every(
        ([key, value]) => event.payload[key] === value,
      ),
  );
  const event = candidates[request.event.occurrence];
  if (!event)
    throw new Error(
      'Requested event occurrence was not captured in this segment',
    );
  const clock = event.payload.captureClock as
    { method?: string; uncertaintyMs?: number } | undefined;
  if (
    clock?.method !== 'page-sampled' ||
    typeof clock.uncertaintyMs !== 'number'
  )
    throw new Error('Event has no calibrated browser timestamp');
  const requestedMs = event.t_mono + request.offsetMs;
  if (requestedMs < segment.startMs || requestedMs > segment.endMs)
    throw new Error('Requested event frame falls outside its proof segment');
  const frame = frames
    .filter(
      (f) =>
        f.pageId === segment.pageId &&
        f.timeMs >= segment.startMs &&
        f.timeMs <= segment.endMs,
    )
    .sort(
      (a, b) =>
        Math.abs(a.timeMs - requestedMs) - Math.abs(b.timeMs - requestedMs),
    )[0];
  if (!frame)
    throw new Error('No captured frame on this page in the proof segment');
  const selectionOffsetMs = frame.timeMs - requestedMs;
  const uncertaintyMs = Math.abs(selectionOffsetMs) + clock.uncertaintyMs;
  if (uncertaintyMs > request.maxOffsetMs)
    throw new Error(
      `Nearest captured frame exceeds the ${request.maxOffsetMs} ms selection tolerance (${uncertaintyMs.toFixed(2)} ms)`,
    );
  return {
    frame,
    event,
    requestedMs,
    selectionOffsetMs,
    uncertaintyMs,
    segment,
  };
}

export async function resolveEventFrames(
  directory: string,
  spec: EvidenceSpec,
  segments: RunManifest['segments'],
  events: CapturedEvent[],
  frames: Frame[],
): Promise<Observation[]> {
  const observations: Observation[] = [];
  for (const checkpoint of spec.checkpoints.filter((cp) => cp.frame)) {
    try {
      const selected = selectEventFrame(checkpoint, segments, events, frames);
      const output = join(directory, 'event-frames', `${checkpoint.id}.png`);
      await mkdir(join(directory, 'event-frames'), { recursive: true });
      await runProcess('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-i',
        selected.frame.path,
        '-frames:v',
        '1',
        output,
      ]);
      observations.push({
        id: `event-frame-${checkpoint.id}`,
        checkpoint: checkpoint.id,
        kind: 'screenshot',
        status: 'passed',
        pageId: selected.frame.pageId,
        timeMs: selected.frame.timeMs,
        endMs: selected.frame.timeMs,
        artifact: relative(directory, output),
        data: {
          selection: 'event-linked',
          eventId: selected.event.id,
          eventTimeMs: selected.event.t_mono,
          requestedMs: selected.requestedMs,
          selectionOffsetMs: selected.selectionOffsetMs,
          uncertaintyMs: selected.uncertaintyMs,
          segmentId: selected.segment.id,
          sourceFrame: relative(directory, selected.frame.path),
        },
      });
    } catch (error) {
      observations.push({
        id: `event-frame-${checkpoint.id}`,
        checkpoint: checkpoint.id,
        kind: 'screenshot',
        status: 'failed',
        pageId:
          segments.find((s) => s.id === checkpoint.frame?.segment)?.pageId ??
          'unavailable',
        timeMs: 0,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return observations;
}
