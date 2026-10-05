const MOTION_GAP = 32;
const TELEPORT_MS = 120;
const SNAPSHOT_MS = 5;
const MASK_KINDS = new Set(['probe.redaction.mask', 'redaction.mask']);

export interface MaskSample {
  readonly group: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly timeMs?: number;
  readonly cleared?: boolean;
  readonly concealed?: boolean;
}

export interface MaskRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly pageId?: string;
}

export interface MaskSourceEvent {
  readonly id: string;
  readonly kind: string;
  readonly pageId: string;
  readonly t_mono: number;
  readonly payload: unknown;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Track {
  x: number;
  y: number;
  width: number;
  height: number;
  last: Box;
  startMs: number;
  endMs?: number;
  lastMs: number;
  lastShotSize: number;
  open: boolean;
}

interface Snapshot {
  timeMs: number;
  boxes: Box[];
  cleared: boolean;
}

/** Password inputs already hide their value, so selectors like this are concealed. */
export function isConcealedInputSelector(selector: string): boolean {
  return /input\s*\[\s*type\s*=\s*['"]?password['"]?\s*\]/iu.test(selector);
}

export function hasPrivacyMaskEvent(
  events: readonly Pick<MaskSourceEvent, 'kind'>[],
): boolean {
  return events.some((event) => MASK_KINDS.has(event.kind));
}

export function maskSamplesFromEvents(
  events: readonly MaskSourceEvent[],
  options: { readonly maskConcealedInputs: boolean },
): MaskSample[] {
  const samples: MaskSample[] = [];
  for (const event of events) {
    const sample = sampleFromEvent(event, options.maskConcealedInputs);
    if (sample) samples.push(sample);
  }
  return samples;
}

/** Timed masks apply only while that control is observed on its page. */
export function privacyMaskVisible(
  mask: Pick<MaskRegion, 'startMs' | 'endMs' | 'pageId'>,
  sourceMs: number | null,
  pageId?: string,
): boolean {
  const timed = mask.startMs !== undefined || mask.endMs !== undefined;
  if (!timed && !mask.pageId) return true;
  if (sourceMs === null || !Number.isFinite(sourceMs)) return false;
  if (mask.pageId && pageId && mask.pageId !== pageId) return false;
  if (mask.startMs !== undefined && sourceMs < mask.startMs) return false;
  if (mask.endMs !== undefined && sourceMs >= mask.endMs) return false;
  return true;
}

/**
 * One opaque region per control. Untimed samples keep a single envelope so
 * continuous motion between samples stays covered. Timed samples do not join
 * a later, separate control that shares the selector.
 */
export function motionMaskEnvelopes(
  samples: readonly MaskSample[],
): MaskRegion[] {
  validateSamples(samples);
  if (samples.every((sample) => sample.timeMs === undefined))
    return timelessEnvelopes(samples);
  if (samples.some((sample) => sample.timeMs === undefined))
    throw new Error('Invalid measured privacy region');
  const groups = new Map<string, MaskSample[]>();
  for (const sample of samples) {
    const list = groups.get(sample.group) ?? [];
    list.push(sample);
    groups.set(sample.group, list);
  }
  return [...groups.entries()].flatMap(([group, list]) =>
    trackGroup(list).map((region) => withPage(region, group)),
  );
}

function sampleFromEvent(
  event: MaskSourceEvent,
  maskConcealedInputs: boolean,
): MaskSample | undefined {
  if (!MASK_KINDS.has(event.kind)) return undefined;
  const record = payloadRecord(event.payload);
  if (!record) return undefined;
  const selector = typeof record.selector === 'string' ? record.selector : '';
  const concealed =
    record.concealed === true || isConcealedInputSelector(selector);
  if (concealed && !maskConcealedInputs) return undefined;
  const group = `${event.pageId}/${selector || event.id}`;
  if (record.cleared === true)
    return {
      group,
      timeMs: event.t_mono,
      cleared: true,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  const box = boxFrom(record);
  if (!box) return undefined;
  return { ...box, group, timeMs: event.t_mono };
}

function payloadRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function boxFrom(record: Record<string, unknown>): Box | undefined {
  const x = numberField(record, 'x');
  const y = numberField(record, 'y');
  const width = numberField(record, 'width');
  const height = numberField(record, 'height');
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  )
    return undefined;
  return { x, y, width, height };
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

function validateSamples(samples: readonly MaskSample[]): void {
  for (const sample of samples) {
    if (sample.cleared) continue;
    if (
      ![sample.x, sample.y, sample.width, sample.height].every(
        Number.isFinite,
      ) ||
      sample.width < 0 ||
      sample.height < 0
    )
      throw new Error('Invalid measured privacy region');
  }
}

function timelessEnvelopes(samples: readonly MaskSample[]): MaskRegion[] {
  const groups = new Map<string, Box>();
  for (const sample of samples) {
    if (!sample.width || !sample.height) continue;
    const previous = groups.get(sample.group);
    groups.set(
      sample.group,
      previous ? union(previous, sample) : boxOf(sample),
    );
  }
  return [...groups.values()];
}

function trackGroup(samples: readonly MaskSample[]): MaskRegion[] {
  const tracks: Track[] = [];
  for (const shot of snapshots(samples)) {
    if (shot.cleared) {
      for (const track of tracks) closeTrack(track, shot.timeMs);
      continue;
    }
    absorbSnapshot(tracks, shot);
  }
  return tracks
    .filter((track) => track.width > 0 && track.height > 0)
    .map(regionFromTrack);
}

function snapshots(samples: readonly MaskSample[]): Snapshot[] {
  const sorted = [...samples].sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
  const shots: Snapshot[] = [];
  for (const sample of sorted) {
    const timeMs = sample.timeMs ?? 0;
    if (sample.cleared) {
      shots.push({ timeMs, boxes: [], cleared: true });
      continue;
    }
    const box = boxOf(sample);
    if (box.width <= 0 || box.height <= 0) continue;
    const last = shots.at(-1);
    if (last && !last.cleared && Math.abs(last.timeMs - timeMs) <= SNAPSHOT_MS)
      last.boxes.push(box);
    else shots.push({ timeMs, boxes: [box], cleared: false });
  }
  return shots;
}

function absorbSnapshot(tracks: Track[], shot: Snapshot): void {
  const open = tracks.filter((track) => track.open);
  const claimed = claimMatches(open, shot.boxes);
  const freeTracks = open.filter((track) => !claimed.tracks.has(track));
  const freeBoxes = shot.boxes.filter((box) => !claimed.boxes.has(box));
  const teleported = teleport(freeTracks, freeBoxes, shot);
  for (const pair of [...claimed.pairs, ...teleported])
    absorb(pair.track, pair.box, shot);
  const used = new Set([
    ...claimed.tracks,
    ...teleported.map((pair) => pair.track),
  ]);
  for (const track of open) {
    if (!used.has(track)) closeTrack(track, shot.timeMs);
  }
  const placed = new Set([
    ...claimed.boxes,
    ...teleported.map((pair) => pair.box),
  ]);
  for (const box of shot.boxes) {
    if (placed.has(box)) continue;
    tracks.push(openTrack(box, shot));
  }
}

function claimMatches(open: readonly Track[], boxes: readonly Box[]) {
  const freeTracks = [...open];
  const freeBoxes = [...boxes];
  const pairs: { track: Track; box: Box }[] = [];
  const tracks = new Set<Track>();
  const claimedBoxes = new Set<Box>();
  let pair = closestPair(freeTracks, freeBoxes);
  while (pair) {
    pairs.push(pair);
    tracks.add(pair.track);
    claimedBoxes.add(pair.box);
    removeItem(freeTracks, pair.track);
    removeItem(freeBoxes, pair.box);
    pair = closestPair(freeTracks, freeBoxes);
  }
  return { pairs, tracks, boxes: claimedBoxes };
}

/**
 * A fast scroll can move one control beyond the motion gap between frames.
 * Join it only when both snapshots hold a single box, so a different control
 * that appears where another vanished is never folded into the old envelope.
 */
function teleport(
  tracks: readonly Track[],
  boxes: readonly Box[],
  shot: Snapshot,
): { track: Track; box: Box }[] {
  const track = tracks[0];
  const box = boxes[0];
  if (tracks.length !== 1 || boxes.length !== 1 || !track || !box) return [];
  if (shot.boxes.length !== 1 || track.lastShotSize !== 1) return [];
  if (shot.timeMs - track.lastMs > TELEPORT_MS) return [];
  return [{ track, box }];
}

function closestPair(tracks: readonly Track[], boxes: readonly Box[]) {
  let best: { track: Track; box: Box; distance: number } | undefined;
  for (const track of tracks) {
    for (const box of boxes) {
      if (!withinGap(track.last, box, MOTION_GAP)) continue;
      const distance = centerDistance(track.last, box);
      if (!best || distance < best.distance) best = { track, box, distance };
    }
  }
  return best;
}

function absorb(track: Track, box: Box, shot: Snapshot): void {
  const next = union(track, box);
  track.x = next.x;
  track.y = next.y;
  track.width = next.width;
  track.height = next.height;
  track.last = box;
  track.lastMs = shot.timeMs;
  track.lastShotSize = shot.boxes.length;
}

function closeTrack(track: Track, timeMs: number): void {
  if (!track.open) return;
  track.open = false;
  track.endMs = timeMs;
}

function openTrack(box: Box, shot: Snapshot): Track {
  return {
    ...box,
    last: box,
    startMs: shot.timeMs,
    lastMs: shot.timeMs,
    lastShotSize: shot.boxes.length,
    open: true,
  };
}

function regionFromTrack(track: Track): MaskRegion {
  return {
    x: track.x,
    y: track.y,
    width: track.width,
    height: track.height,
    startMs: track.startMs,
    ...(track.endMs === undefined ? {} : { endMs: track.endMs }),
  };
}

function withPage(region: MaskRegion, group: string): MaskRegion {
  const slash = group.indexOf('/');
  if (slash <= 0) return region;
  return { ...region, pageId: group.slice(0, slash) };
}

function boxOf(sample: Box): Box {
  return {
    x: sample.x,
    y: sample.y,
    width: sample.width,
    height: sample.height,
  };
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function withinGap(a: Box, b: Box, gap: number): boolean {
  const gapX = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const gapY = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return gapX <= gap && gapY <= gap;
}

function centerDistance(a: Box, b: Box): number {
  return Math.hypot(
    a.x + a.width / 2 - (b.x + b.width / 2),
    a.y + a.height / 2 - (b.y + b.height / 2),
  );
}

function removeItem<T>(items: T[], item: T): void {
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
}
