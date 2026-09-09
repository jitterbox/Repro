import type { ShareReport } from '@repro/contracts';
import { mapComparisonTime } from './sync-time.js';
import type { SyncKnot } from './sync-time.js';
export type { SyncKnot } from './sync-time.js';
export type ViewerTheme = 'dark' | 'high-contrast' | 'light';
export type ReviewerPreset = 'alm' | 'developer' | 'product' | 'tester';
export type ViewerStateKind =
  'empty' | 'error' | 'loading' | 'ready' | 'redaction-blocked';

export interface EvidenceManifest {
  readonly assets: readonly EvidenceManifestAsset[];
  readonly compare?: EvidenceCompareMeta;
  readonly schemaVersion: number;
}

export interface EvidenceCompareMeta {
  readonly syncMap?: readonly SyncKnot[];
}

export interface EvidenceManifestAsset {
  readonly href: string;
  readonly kind: 'chapters' | 'json' | 'mp4' | 'vtt' | 'png';
  readonly path?: string;
  readonly role?: 'after' | 'before';
  readonly title?: string;
}

export interface ViewerReport {
  readonly title?: string;
  readonly variants?: readonly {
    role?: 'before' | 'after' | 'standalone' | 'single';
    label: string;
    outcome: string;
    expected: string;
    durationMs: number;
  }[];
  readonly annotations?: readonly ViewerAnnotation[];
  readonly chapters?: readonly ViewerChapter[];
  readonly redactionBlocked?: boolean;
  readonly transcript?: readonly TranscriptLine[];
}

export interface ViewerAnnotation {
  readonly label: string;
  readonly severity?: 'critical' | 'info' | 'low' | 'medium' | 'high';
  readonly shape?: 'ellipse' | 'path' | 'rect' | 'underline';
  readonly timeRange?: { readonly start: number; readonly end: number };
}

export interface ViewerChapter {
  readonly title: string;
  readonly timeRange?: { readonly start: number; readonly end: number };
  readonly variantTimeRanges?: ShareReport['chapters'][number]['variantTimeRanges'];
}

export interface TranscriptLine {
  readonly endMs?: number;
  readonly speaker?: string;
  readonly startMs: number;
  readonly text: string;
}

export type KeyboardAction =
  'back' | 'end' | 'forward' | 'start' | 'toggle-play';

export interface KeyboardShortcut {
  readonly action: KeyboardAction;
  readonly handled: boolean;
}

const PRESET_SECTIONS: Readonly<Record<ReviewerPreset, readonly string[]>> = {
  alm: ['summary', 'evidence', 'redaction', 'links'],
  developer: ['timeline', 'annotations', 'console', 'network'],
  product: ['summary', 'chapters', 'impact', 'open-questions'],
  tester: ['steps', 'assertions', 'environment', 'redaction'],
};

const SHAPE_TEXT: Readonly<Record<string, string>> = {
  ellipse: 'circle highlight',
  path: 'path marker',
  rect: 'rectangle highlight',
  underline: 'underline marker',
};

const SYNC_TOLERANCE_MS = 100;
const SEEK_STEP_SECONDS = 5;

export function reviewerPresetSections(
  preset: ReviewerPreset,
): readonly string[] {
  return PRESET_SECTIONS[preset];
}

export function annotationCue(annotation: ViewerAnnotation): string {
  const severity = annotation.severity ?? 'info';
  const shape = SHAPE_TEXT[annotation.shape ?? 'rect'] ?? 'marker';
  return `${severityIcon(severity)} ${shape}: ${annotation.label}`;
}

export function keyboardShortcutFor(key: string): KeyboardShortcut {
  if (key === ' ') {
    return { action: 'toggle-play', handled: true };
  }

  if (key === 'ArrowLeft') {
    return { action: 'back', handled: true };
  }

  if (key === 'ArrowRight') {
    return { action: 'forward', handled: true };
  }

  if (key === 'Home') {
    return { action: 'start', handled: true };
  }

  if (key === 'End') {
    return { action: 'end', handled: true };
  }

  return { action: 'toggle-play', handled: false };
}

export function shouldReduceMotion(
  query = '(prefers-reduced-motion: reduce)',
): boolean {
  const matcher = (
    globalThis as {
      readonly matchMedia?: (query: string) => MediaQueryList;
    }
  ).matchMedia;
  return matcher?.(query).matches ?? false;
}

export function mapSyncTime(
  sourceMs: number,
  knots: readonly SyncKnot[],
  from: 'a' | 'b',
  to: 'a' | 'b',
): number {
  return mapComparisonTime(
    sourceMs,
    knots,
    from === 'a' ? 0 : 1,
    to === 'a' ? 0 : 1,
  );
}

export function activeAnnotationIndex(
  annotations: readonly ViewerAnnotation[],
  timeSeconds: number,
): number {
  const timeMs = timeSeconds * 1000;
  let match = -1;

  for (let index = 0; index < annotations.length; index += 1) {
    const range = annotations[index]?.timeRange;
    if (range === undefined) {
      continue;
    }

    const startMs = range.start;
    const endMs = range.end > 0 ? range.end : range.start + SYNC_TOLERANCE_MS;
    if (
      timeMs >= startMs - SYNC_TOLERANCE_MS &&
      timeMs <= endMs + SYNC_TOLERANCE_MS
    ) {
      match = index;
    }
  }

  return match;
}

export async function mountViewer(root: ParentNode = document): Promise<void> {
  setState(root, 'loading', 'Loading report...');

  try {
    const manifest = await loadManifest();
    const report = await loadReport(manifest);
    renderAssets(root, manifest, report);
    setState(
      root,
      report.redactionBlocked === true ? 'redaction-blocked' : 'ready',
    );
  } catch (error) {
    setState(root, 'error', errorMessage(error));
  }
}

function renderAssets(
  root: ParentNode,
  manifest: EvidenceManifest,
  report: ViewerReport,
): void {
  const video = root.querySelector<HTMLVideoElement>('[data-repro-video]');
  const videoB = root.querySelector<HTMLVideoElement>('[data-repro-video-b]');
  const mp4Assets = manifest.assets.filter((asset) => asset.kind === 'mp4');
  const primary =
    mp4Assets.find((asset) => asset.role === 'before') ?? mp4Assets[0];
  const secondary =
    mp4Assets.find((asset) => asset.role === 'after' && asset !== primary) ??
    mp4Assets.find((asset) => asset !== primary);
  const title = root.querySelector('#media-title');
  if (title && report.title) title.textContent = report.title;
  if (report.variants) {
    const summary = document.createElement('p');
    summary.textContent = report.variants
      .map(
        (variant) =>
          `${variant.label}: ${variant.outcome} (${(variant.durationMs / 1000).toFixed(2)} seconds original)`,
      )
      .join(' | ');
    title?.after(summary);
  }
  const captionsFor = (asset: EvidenceManifestAsset | undefined) =>
    manifest.assets.find(
      (candidate) => candidate.kind === 'vtt' && candidate.role === asset?.role,
    );
  const vtt = captionsFor(primary);
  const syncKnots = manifest.compare?.syncMap ?? [];
  const compareMode = syncKnots.length > 0 || secondary !== undefined;

  if (video !== null && primary !== undefined) {
    video.src = primary.href;
    video.setAttribute(
      'aria-label',
      primary.role === 'before' ? 'Before evidence video' : 'Evidence video',
    );
    wireKeyboard(video);
    wirePlayheadSync(root, video, report.annotations ?? []);
  }

  if (video !== null && vtt !== undefined) {
    const track = video.querySelector('track');
    track?.setAttribute('src', vtt.href);
  }

  if (
    compareMode &&
    video !== null &&
    videoB !== null &&
    secondary !== undefined
  ) {
    videoB.src = secondary.href;
    wireKeyboard(videoB);
    const captions = captionsFor(secondary);
    if (captions)
      videoB.querySelector('track')?.setAttribute('src', captions.href);
    wireComparePlayer(root, video, videoB, syncKnots);
  }

  const stills = root.querySelector('[data-viewer-stills]');
  for (const asset of manifest.assets.filter(
    (candidate) => candidate.kind === 'png',
  )) {
    const label =
      report.variants?.find((variant) => variant.role === asset.role)?.label ??
      asset.role ??
      'Checkpoint';
    const figure = document.createElement('figure');
    const image = document.createElement('img');
    image.src = asset.href;
    image.alt = `${label} · ${asset.title ?? 'Annotated checkpoint'}`;
    image.loading = 'lazy';
    image.style.maxWidth = '100%';
    const caption = document.createElement('figcaption');
    caption.textContent = image.alt;
    figure.append(image, caption);
    stills?.append(figure);
  }
  renderList(
    root,
    '[data-viewer-chapters]',
    report.chapters ?? [],
    chapterNode,
  );
  renderList(
    root,
    '[data-viewer-annotations]',
    report.annotations ?? [],
    annotationNode,
  );
  renderList(
    root,
    '[data-viewer-transcript]',
    report.transcript ?? [],
    transcriptNode,
  );
  renderTimeline(root, report);
  if (video && primary)
    wireScrubber(
      root,
      [
        { video, side: 'a', role: primary.role ?? 'standalone' },
        ...(videoB && secondary
          ? [
              {
                video: videoB,
                side: 'b' as const,
                role: secondary.role ?? ('after' as const),
              },
            ]
          : []),
      ],
      report.chapters ?? [],
      syncKnots,
    );
  wireControls(root);
  applyReviewerPreset(root, 'developer');
}

async function loadManifest(): Promise<EvidenceManifest> {
  const url = new URL(globalThis.location.href);
  const manifestUrl =
    url.searchParams.get('manifest') ?? '../../evidence-manifest.json';
  const manifest = await fetchJson<EvidenceManifest>(manifestUrl);
  const base = new URL(manifestUrl, window.location.href);
  return {
    ...manifest,
    assets: manifest.assets.map((asset) => ({
      ...asset,
      href: new URL(asset.href, base).href,
    })),
  };
}

async function loadReport(manifest: EvidenceManifest): Promise<ViewerReport> {
  const reportAsset = assetOfKind(manifest, 'json');

  if (reportAsset === undefined) {
    return {};
  }

  return fetchJson<ViewerReport>(reportAsset.href);
}

async function fetchJson<T>(href: string): Promise<T> {
  const response = await fetch(href);

  if (!response.ok) {
    throw new Error(`Failed to load ${href}`);
  }

  return response.json() as Promise<T>;
}

function renderList<T>(
  root: ParentNode,
  selector: string,
  items: readonly T[],
  create: (item: T) => HTMLElement,
): void {
  const container = root.querySelector(selector);

  if (container === null) {
    return;
  }

  container.append(...emptyAware(items, create));
}

function emptyAware<T>(
  items: readonly T[],
  create: (item: T) => HTMLElement,
): readonly HTMLElement[] {
  if (items.length === 0) {
    return [element('p', 'empty', 'No entries.')];
  }

  return items.map(create);
}

function chapterNode(chapter: ViewerChapter): HTMLElement {
  const node = element('button', 'chapter', chapter.title);
  node.setAttribute('type', 'button');
  if (chapter.timeRange !== undefined) {
    node.dataset.startMs = String(chapter.timeRange.start);
  }
  return node;
}

function annotationNode(annotation: ViewerAnnotation): HTMLElement {
  const node = element('article', 'annotation', annotationCue(annotation));
  node.dataset.severity = annotation.severity ?? 'info';
  if (annotation.timeRange !== undefined) {
    node.dataset.startMs = String(annotation.timeRange.start);
    node.dataset.endMs = String(annotation.timeRange.end);
  }
  return node;
}

function transcriptNode(line: TranscriptLine): HTMLElement {
  const speaker = line.speaker === undefined ? '' : `${line.speaker}: `;
  return element('p', 'transcript-line', `${speaker}${line.text}`);
}

function renderTimeline(root: ParentNode, report: ViewerReport): void {
  const timeline = root.querySelector('[data-viewer-timeline]');

  if (timeline === null) {
    return;
  }

  const chapters = report.chapters ?? [];
  timeline.append(...emptyAware(chapters, chapterNode));
}

function wireControls(root: ParentNode): void {
  const theme = root.querySelector<HTMLSelectElement>('[data-viewer-theme]');
  theme?.addEventListener('change', () => {
    document.documentElement.dataset.theme = theme.value;
  });

  const preset = root.querySelector<HTMLSelectElement>('[data-viewer-preset]');
  preset?.addEventListener('change', () => {
    applyReviewerPreset(root, preset.value as ReviewerPreset);
  });
}

function applyReviewerPreset(root: ParentNode, preset: ReviewerPreset): void {
  const visible = new Set(reviewerPresetSections(preset));
  const sections = root.querySelectorAll<HTMLElement>('[data-viewer-section]');

  for (const section of Array.from(sections)) {
    const tokens = (section.dataset.viewerSection ?? '')
      .split(/\s+/u)
      .filter((token: string) => token.length > 0);
    const show = tokens.some((token) => visible.has(token));
    section.hidden = !show;
  }
}

function wirePlayheadSync(
  root: ParentNode,
  video: HTMLVideoElement,
  annotations: readonly ViewerAnnotation[],
): void {
  const container = root.querySelector('[data-viewer-annotations]');
  if (container === null || annotations.length === 0) {
    return;
  }

  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>('.annotation'),
  );

  const sync = (): void => {
    const index = activeAnnotationIndex(annotations, video.currentTime);
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const node = nodes[nodeIndex];
      if (node === undefined) {
        continue;
      }
      const active = nodeIndex === index;
      node.dataset.active = active ? 'true' : 'false';
      if (active) {
        node.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }
  };

  video.addEventListener('timeupdate', sync);
  video.addEventListener('seeked', sync);
}

function wireScrubber(
  root: ParentNode,
  players: readonly {
    video: HTMLVideoElement;
    side: 'a' | 'b';
    role: 'before' | 'after' | 'standalone';
  }[],
  chapters: readonly ViewerChapter[],
  knots: readonly SyncKnot[],
): void {
  const scrubber = root.querySelector<HTMLElement>('[data-viewer-scrubber]');
  const seek = root.querySelector<HTMLInputElement>('[data-viewer-seek]');
  const markers = root.querySelector('[data-viewer-markers]');

  if (scrubber === null || seek === null || markers === null) {
    return;
  }

  const active = () =>
    requireValue(
      players.find((player) => player.video.tabIndex >= 0) ?? players[0],
    );
  const chapterTime = (chapter: ViewerChapter): number | undefined => {
    const player = active();
    const actual = chapter.variantTimeRanges?.[player.role]?.start;
    if (actual !== undefined) return actual;
    const source = chapter.timeRange?.start;
    return source === undefined
      ? undefined
      : mapSyncTime(source, knots, 'a', player.side);
  };
  const jump = (chapter: ViewerChapter): void => {
    const ms = chapterTime(chapter);
    if (ms !== undefined) {
      active().video.currentTime = ms / 1000;
      seek.value = String(Math.round(ms));
    }
  };
  const updateRange = (): void => {
    const { video, role } = active();
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }

    scrubber.hidden = false;
    seek.max = String(Math.round(video.duration * 1000));
    seek.value = String(Math.round(video.currentTime * 1000));
    seek.setAttribute('aria-label', `Seek ${role} evidence`);
    renderChapterMarkers(markers, chapters, video.duration, chapterTime, jump);
  };

  for (const { video } of players) {
    video.addEventListener('loadedmetadata', updateRange);
    video.addEventListener('durationchange', updateRange);
    video.addEventListener('repro-side-change', updateRange);
    const syncValue = () => {
      if (active().video === video)
        seek.value = String(Math.round(video.currentTime * 1000));
    };
    video.addEventListener('timeupdate', syncValue);
    video.addEventListener('seeking', syncValue);
    video.addEventListener('seeked', syncValue);
  }

  seek.addEventListener('input', () => {
    active().video.currentTime = Number.parseInt(seek.value, 10) / 1000;
  });
  for (const button of Array.from(
    root.querySelectorAll<HTMLButtonElement>('button.chapter'),
  )) {
    const chapter = chapters.find(
      (candidate) =>
        candidate.title === button.textContent &&
        String(candidate.timeRange?.start) === button.dataset.startMs,
    );
    if (chapter)
      button.addEventListener('click', () => {
        jump(chapter);
      });
    else button.disabled = true;
  }
  updateRange();
}

function renderChapterMarkers(
  container: Element,
  chapters: readonly ViewerChapter[],
  durationSeconds: number,
  chapterTime: (chapter: ViewerChapter) => number | undefined,
  jump: (chapter: ViewerChapter) => void,
): void {
  container.replaceChildren();

  if (durationSeconds <= 0) {
    return;
  }

  for (const chapter of chapters) {
    const startMs = chapterTime(chapter);
    if (startMs === undefined) {
      continue;
    }

    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'scrubber-marker';
    marker.style.left = `${String((startMs / 1000 / durationSeconds) * 100)}%`;
    marker.title = chapter.title;
    marker.setAttribute('aria-label', `Chapter: ${chapter.title}`);
    marker.addEventListener('click', () => {
      jump(chapter);
    });
    container.append(marker);
  }
}

function wireComparePlayer(
  root: ParentNode,
  videoA: HTMLVideoElement,
  videoB: HTMLVideoElement,
  syncKnots: readonly SyncKnot[],
): void {
  const toggle = root.querySelector<HTMLElement>(
    '[data-viewer-compare-toggle]',
  );
  if (toggle === null) {
    return;
  }

  toggle.hidden = false;
  const independent = root.querySelector<HTMLInputElement>(
    '[data-compare-independent]',
  );
  if (independent) {
    independent.checked = syncKnots.length < 2;
    independent.disabled = syncKnots.length < 2;
  }
  const layout = root.querySelector<HTMLSelectElement>('[data-compare-layout]');
  const timing = root.querySelector('[data-compare-timing]');
  const showTiming = () => {
    if (timing)
      timing.textContent = `${independent?.checked ? 'Independent' : 'Synchronized'} presentation timing (includes reading holds): Before ${videoA.currentTime.toFixed(2)} / ${Number.isFinite(videoA.duration) ? videoA.duration.toFixed(2) : 'unknown'} s · After ${videoB.currentTime.toFixed(2)} / ${Number.isFinite(videoB.duration) ? videoB.duration.toFixed(2) : 'unknown'} s`;
  };
  independent?.addEventListener('change', () => {
    videoA.playbackRate = 1;
    videoB.playbackRate = 1;
    videoA.controls = !videoA.hidden;
    videoB.controls = !videoB.hidden && independent.checked;
    showTiming();
  });
  for (const video of [videoA, videoB]) {
    video.addEventListener('loadedmetadata', showTiming);
    video.addEventListener('timeupdate', showTiming);
  }
  let activeSide: 'a' | 'b' = 'a';
  let syncing = false;

  const setSide = (side: 'a' | 'b' | 'both'): void => {
    activeSide = side === 'b' ? 'b' : 'a';
    root
      .querySelector('[data-repro-video-shell]')
      ?.setAttribute('data-layout', side);
    videoA.setAttribute('aria-hidden', String(side === 'b'));
    videoB.setAttribute('aria-hidden', String(side === 'a'));
    videoA.tabIndex = activeSide === 'a' ? 0 : -1;
    videoB.tabIndex = activeSide === 'b' ? 0 : -1;
    videoA.dispatchEvent(new Event('repro-side-change'));
    for (const button of Array.from(
      toggle.querySelectorAll<HTMLButtonElement>('[data-compare-side]'),
    )) {
      const pressed = button.dataset.compareSide === side;
      button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }

    if (side !== 'b') {
      videoA.hidden = false;
      videoA.controls = true;
      videoB.hidden = side === 'a';
      videoB.controls = side === 'both' && independent?.checked === true;
      videoB.pause();
      return;
    }

    videoA.hidden = true;
    videoA.controls = false;
    videoB.hidden = false;
    videoB.controls = true;
    videoA.pause();
  };
  layout?.addEventListener('change', () => {
    setSide('both');
    root
      .querySelector('[data-repro-video-shell]')
      ?.setAttribute('data-visual-layout', layout.value);
  });

  for (const button of Array.from(
    toggle.querySelectorAll<HTMLButtonElement>('[data-compare-side]'),
  )) {
    button.addEventListener('click', () => {
      const side =
        button.dataset.compareSide === 'both'
          ? 'both'
          : button.dataset.compareSide === 'b'
            ? 'b'
            : 'a';
      setSide(side);
      const master = activeSide === 'a' ? videoA : videoB;
      const follower = activeSide === 'a' ? videoB : videoA;
      const masterMs = master.currentTime * 1000;
      if (!independent?.checked)
        follower.currentTime =
          mapSyncTime(
            masterMs,
            syncKnots,
            activeSide,
            activeSide === 'a' ? 'b' : 'a',
          ) / 1000;
    });
  }

  const mirrorTime = (master: HTMLVideoElement, from: 'a' | 'b'): void => {
    if (syncing || independent?.checked) {
      return;
    }
    syncing = true;
    const follower = from === 'a' ? videoB : videoA;
    const to = from === 'a' ? 'b' : 'a';
    const masterMs = master.currentTime * 1000;
    const nextTime = mapSyncTime(masterMs, syncKnots, from, to) / 1000;
    if (Math.abs(follower.currentTime - nextTime) > 1 / 60)
      follower.currentTime = nextTime;
    syncing = false;
  };

  videoA.addEventListener('seeked', () => {
    if (activeSide === 'a') {
      mirrorTime(videoA, 'a');
    }
  });
  videoB.addEventListener('seeked', () => {
    if (activeSide === 'b') {
      mirrorTime(videoB, 'b');
    }
  });
  videoA.addEventListener('timeupdate', () => {
    if (activeSide === 'a') {
      mirrorTime(videoA, 'a');
    }
  });
  videoB.addEventListener('timeupdate', () => {
    if (activeSide === 'b') {
      mirrorTime(videoB, 'b');
    }
  });

  // timeupdate alone is too infrequent for paired visual inspection. Keep the
  // passive side aligned on animation frames while the selected side plays.
  let animation: number | undefined;
  const followPlayback = () => {
    if (animation !== undefined) cancelAnimationFrame(animation);
    const tick = () => {
      const master = activeSide === 'a' ? videoA : videoB;
      mirrorTime(master, activeSide);
      animation =
        master.paused || master.ended ? undefined : requestAnimationFrame(tick);
    };
    tick();
  };
  videoA.addEventListener('play', followPlayback);
  videoB.addEventListener('play', followPlayback);
  setSide('both');
}

function wireKeyboard(video: HTMLVideoElement): void {
  const handler = (event: KeyboardEvent): void => {
    const shortcut = keyboardShortcutFor(event.key);

    if (
      video.hidden ||
      video.tabIndex < 0 ||
      event.defaultPrevented ||
      !shortcut.handled
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.repeat && shortcut.action === 'toggle-play') return;
    applyShortcut(video, shortcut);
  };

  // Native video controls also toggle Space on keyup. Own both phases for
  // documented shortcuts so one press cannot play and immediately pause.
  video.addEventListener('keydown', handler, { capture: true });
  video.addEventListener(
    'keyup',
    (event) => {
      if (
        !video.hidden &&
        video.tabIndex >= 0 &&
        keyboardShortcutFor(event.key).handled
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
  document.addEventListener('keydown', (event) => {
    if (event.target === document.body) {
      handler(event);
    }
  });
}

function applyShortcut(
  video: HTMLVideoElement,
  shortcut: KeyboardShortcut,
): void {
  if (shortcut.action === 'back') {
    video.currentTime = Math.max(0, video.currentTime - SEEK_STEP_SECONDS);
    return;
  }

  if (shortcut.action === 'forward') {
    video.currentTime = Math.min(
      video.duration || Number.MAX_SAFE_INTEGER,
      video.currentTime + SEEK_STEP_SECONDS,
    );
    return;
  }

  if (shortcut.action === 'start') {
    video.currentTime = 0;
    return;
  }

  if (shortcut.action === 'end') {
    if (Number.isFinite(video.duration)) {
      video.currentTime = video.duration;
    }
    return;
  }

  if (video.paused) {
    void video.play();
    return;
  }

  video.pause();
}

function setState(
  root: ParentNode,
  state: ViewerStateKind,
  message = stateMessage(state),
): void {
  const node = root.querySelector('[data-viewer-state]');
  node?.classList.toggle('redaction-blocked', state === 'redaction-blocked');

  if (node !== null) {
    node.textContent = message;
  }
}

function assetOfKind(
  manifest: EvidenceManifest,
  kind: EvidenceManifestAsset['kind'],
): EvidenceManifestAsset | undefined {
  return manifest.assets.find((asset) => asset.kind === kind);
}

function element(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function severityIcon(severity: string): string {
  if (severity === 'critical' || severity === 'high') {
    return '!';
  }

  if (severity === 'medium') {
    return '^';
  }

  return 'i';
}

function stateMessage(state: ViewerStateKind): string {
  if (state === 'ready') {
    return 'Report ready.';
  }

  if (state === 'redaction-blocked') {
    return 'Redaction blocked this report.';
  }

  return `${state}.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load report.';
}

if (typeof document !== 'undefined') {
  void mountViewer();
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
