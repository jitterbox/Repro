export type ViewerTheme = 'dark' | 'high-contrast' | 'light';
export type ReviewerPreset = 'alm' | 'developer' | 'product' | 'tester';
export type ViewerStateKind =
  | 'empty'
  | 'error'
  | 'loading'
  | 'ready'
  | 'redaction-blocked';

export interface EvidenceManifest {
  readonly assets: readonly EvidenceManifestAsset[];
  readonly schemaVersion: number;
}

export interface EvidenceManifestAsset {
  readonly href: string;
  readonly kind: 'chapters' | 'json' | 'mp4' | 'vtt';
  readonly path?: string;
}

export interface ViewerReport {
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
}

export interface TranscriptLine {
  readonly endMs?: number;
  readonly speaker?: string;
  readonly startMs: number;
  readonly text: string;
}

export interface KeyboardShortcut {
  readonly action: 'back' | 'forward' | 'toggle-play';
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

  return { action: 'toggle-play', handled: false };
}

export function shouldReduceMotion(query = '(prefers-reduced-motion: reduce)'):
  boolean {
  const matcher = (globalThis as {
    readonly matchMedia?: (query: string) => MediaQueryList;
  }).matchMedia;
  return matcher?.(query).matches ?? false;
}

export async function mountViewer(root: ParentNode = document): Promise<void> {
  setState(root, 'loading', 'Loading report...');

  try {
    const manifest = await loadManifest();
    const report = await loadReport(manifest);
    renderAssets(root, manifest, report);
    setState(root, report.redactionBlocked === true
      ? 'redaction-blocked'
      : 'ready');
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
  const mp4 = assetOfKind(manifest, 'mp4');
  const vtt = assetOfKind(manifest, 'vtt');

  if (video !== null && mp4 !== undefined) {
    video.src = mp4.href;
    wireKeyboard(video);
  }

  if (video !== null && vtt !== undefined) {
    const track = video.querySelector('track');
    track?.setAttribute('src', vtt.href);
  }

  renderList(root, '[data-viewer-chapters]', report.chapters ?? [], chapterNode);
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
  wireControls(root);
}

async function loadManifest(): Promise<EvidenceManifest> {
  const url = new URL(globalThis.location.href);
  const manifestUrl = url.searchParams.get('manifest') ??
    '../evidence-manifest.json';
  return fetchJson<EvidenceManifest>(manifestUrl);
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
  return element('article', 'chapter', chapter.title);
}

function annotationNode(annotation: ViewerAnnotation): HTMLElement {
  const node = element('article', 'annotation', annotationCue(annotation));
  node.dataset.severity = annotation.severity ?? 'info';
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
}

function wireKeyboard(video: HTMLVideoElement): void {
  video.addEventListener('keydown', (event) => {
    const shortcut = keyboardShortcutFor(event.key);

    if (!shortcut.handled) {
      return;
    }

    event.preventDefault();
    applyShortcut(video, shortcut);
  });
}

function applyShortcut(
  video: HTMLVideoElement,
  shortcut: KeyboardShortcut,
): void {
  if (shortcut.action === 'back') {
    video.currentTime = Math.max(0, video.currentTime - 5);
    return;
  }

  if (shortcut.action === 'forward') {
    video.currentTime += 5;
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
