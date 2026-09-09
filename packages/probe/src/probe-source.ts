import { record } from '@rrweb/record';
import { sampleDocumentClock } from './document-clock.js';
import { onCLS, onINP, onLCP } from 'web-vitals/attribution';

import type {
  CLSMetricWithAttribution,
  INPMetricWithAttribution,
  LCPMetricWithAttribution,
  MetricWithAttribution,
} from 'web-vitals/attribution';

export const PROBE_PROTOCOL = 1 as const;

interface RrwebMaskOptions {
  readonly blockSelector?: string;
  readonly maskAllInputs: boolean;
  readonly maskTextSelector: string;
}

export const RRWEB_MASK_OPTIONS: RrwebMaskOptions = {
  maskAllInputs: true,
  maskTextSelector: '*',
  blockSelector: '[data-repro-overlay]',
};

export const PROBE_CAPABILITIES = [
  'keystrokes',
  'pointer-path',
  'geometry',
  'rrweb',
  'long-animation-frame',
  'freeze-detection',
  'vitals',
  'web-vitals-attribution',
  'overlay-stubs',
] as const;

type RrwebRecordOptions = NonNullable<Parameters<typeof record>[0]>;

interface ProbeEvent {
  protocol: typeof PROBE_PROTOCOL;
  type: string;
  time: number;
  [key: string]: unknown;
}

interface ProbeFlags {
  cursorRipples?: boolean;
  keystrokeBadges?: boolean;
  vitalsHud?: boolean;
  freezeBadge?: boolean;
  a11yOverlays?: boolean;
}

interface ProbeInfo {
  version: typeof PROBE_PROTOCOL;
  capabilities: readonly string[];
  maskOptions: typeof RRWEB_MASK_OPTIONS;
}

interface RectSample {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

declare global {
  interface Window {
    __reproEmit?: (event: ProbeEvent) => void;
    __REPRO_FLAGS__?: ProbeFlags;
    __REPRO_PROBE__?: ProbeInfo;
    __REPRO_TARGETS__?: readonly string[];
    __REPRO_DOCUMENT_ID__?: string;
  }
}

const state: {
  host?: HTMLDivElement;
  root?: ShadowRoot;
  observers: PerformanceObserver[];
  lastFrame: number;
  rrwebStop?: () => void;
} = {
  observers: [],
  lastFrame: 0,
};

function emit(type: string, payload: Record<string, unknown> = {}): void {
  try {
    const clock = sampleDocumentClock();
    window.__reproEmit?.({
      protocol: PROBE_PROTOCOL,
      type,
      time: clock.now,
      timeOrigin: clock.timeOrigin,
      documentId: clock.documentId,
      ...payload,
    });
  } catch {
    // The page under test must keep running if the receiver misbehaves.
  }
}

function safeRun(task: () => void): void {
  try {
    task();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    emit('probe:error', { message });
  }
}

function attachWhenReady(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installProbe, { once: true });
    return;
  }

  installProbe();
}

function installProbe(): void {
  safeRun(() => {
    declareProbe();
    startRrwebRecorder();
    startVitalsObservers();

    if (!createOverlay()) {
      return;
    }

    listenForKeys();
    listenForPointers();
    startGeometryTracker();
    startLongAnimationFrames();
    startFreezeDetector();
    renderA11yOverlays();
  });
}

function declareProbe(): void {
  window.__REPRO_PROBE__ = {
    version: PROBE_PROTOCOL,
    capabilities: [...PROBE_CAPABILITIES],
    maskOptions: RRWEB_MASK_OPTIONS,
  };
}

function startRrwebRecorder(): void {
  if (!(window as unknown as { __REPRO_RRWEB__?: boolean }).__REPRO_RRWEB__)
    return;
  if (state.rrwebStop !== undefined) {
    return;
  }

  const stop = record(rrwebRecordOptions());

  if (typeof stop === 'function') {
    state.rrwebStop = stop;
  }
}

function rrwebRecordOptions(): RrwebRecordOptions {
  const baseOptions = {
    emit: emitRrwebEvent,
    maskAllInputs: RRWEB_MASK_OPTIONS.maskAllInputs,
    maskTextSelector: RRWEB_MASK_OPTIONS.maskTextSelector,
  } satisfies RrwebRecordOptions;

  return {
    ...baseOptions,
    ...(RRWEB_MASK_OPTIONS.blockSelector === undefined
      ? {}
      : { blockSelector: RRWEB_MASK_OPTIONS.blockSelector }),
  };
}

function emitRrwebEvent(event: unknown): void {
  emit('rrweb', { event });
}

function createOverlay(): boolean {
  if (document.querySelector('[data-repro-overlay="1"]')) {
    return false;
  }

  const host = document.createElement('div');
  host.setAttribute('data-repro-overlay', '1');
  host.setAttribute('inert', '');
  applyHostStyles(host);
  document.body.append(host);
  state.host = host;
  state.root = host.attachShadow({ mode: 'closed' });
  return true;
}

function applyHostStyles(host: HTMLElement): void {
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
}

function listenForKeys(): void {
  window.addEventListener('keydown', onKeyDown, {
    capture: true,
    passive: true,
  });
}

function onKeyDown(event: KeyboardEvent): void {
  safeRun(() => {
    const printable = isPrintableKey(event);
    const key = printable ? 'Printable' : event.key;

    emit('input:key', {
      printable,
      key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      selector: selectorForTarget(event.target),
    });

    renderKeystrokeBadge(key);
  });
}

function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey;
}

function listenForPointers(): void {
  const options = { capture: true, passive: true };
  window.addEventListener('pointermove', onPointer, options);
  window.addEventListener('pointerdown', onPointer, options);
  window.addEventListener('pointerup', onPointer, options);
  window.addEventListener('pointercancel', onPointer, options);
}

function onPointer(event: PointerEvent): void {
  safeRun(() => {
    const point = {
      x: event.clientX,
      y: event.clientY,
    };

    emit('pointer:path', {
      phase: event.type,
      x: point.x,
      y: point.y,
      button: event.button,
      buttons: event.buttons,
      pointerType: event.pointerType,
      coordinateSpace:
        window === window.top ? 'viewport-css' : 'frame-viewport-css',
      path: pathSelectors(event),
    });

    renderCursorRipple(point);
  });
}

function pathSelectors(event: Event): string[] {
  return event
    .composedPath()
    .map(selectorForTarget)
    .filter(isString)
    .slice(0, 8);
}

function selectorForTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  return selectorForElement(target);
}

function selectorForElement(element: Element): string {
  const id = element.getAttribute('id');

  if (id) {
    return `#${cssEscape(id)}`;
  }

  return selectorWithoutId(element);
}

function selectorWithoutId(element: Element): string {
  const testId = element.getAttribute('data-testid');

  if (testId) {
    return `[data-testid="${attributeEscape(testId)}"]`;
  }

  const tagName = element.localName;
  const className = element.classList.item(0);
  return className ? `${tagName}.${cssEscape(className)}` : tagName;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function attributeEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function startGeometryTracker(): void {
  const sample = (): void => {
    safeRun(sampleGeometry);
  };

  sample();
  window.setInterval(sample, 250);
}

function sampleGeometry(): void {
  const targets = window.__REPRO_TARGETS__;

  if (!targets?.length) {
    return;
  }

  const samples = targets.flatMap(sampleSelectorGeometry);

  if (samples.length) {
    emit('geometry:sample', { samples });
  }
}

function sampleSelectorGeometry(selector: string): unknown[] {
  const elements = queryTargets(selector).slice(0, 20);
  return elements.map((element) => ({
    selector,
    rect: rectFrom(element.getBoundingClientRect()),
  }));
}

function queryTargets(selector: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function rectFrom(rect: DOMRect): RectSample {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

function startLongAnimationFrames(): void {
  observePerformance('long-animation-frame', (entries) => {
    for (const entry of entries) {
      emit('perf:loaf', serializePerformanceEntry(entry));
    }
  });
}

function startFreezeDetector(): void {
  state.lastFrame = performance.now();

  const tick = (time: number): void => {
    const duration = time - state.lastFrame;
    state.lastFrame = time;

    if (duration > 1000) {
      emit('perf:freeze', { duration: Math.round(duration) });
      renderFreezeBadge(duration);
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

function startVitalsObservers(): void {
  const options = {
    generateTarget: selectorForNode,
    reportAllChanges: true,
  };

  onCLS(reportCLS, options);
  onLCP(reportLCP, options);
  onINP(reportINP, options);
}

function observePerformance(
  entryType: string,
  handler: (entries: PerformanceEntry[]) => void,
): void {
  if (!supportsPerformanceEntry(entryType)) {
    return;
  }

  const observer = new PerformanceObserver((list) => {
    safeRun(() => {
      handler(list.getEntries());
    });
  });

  observer.observe({ type: entryType, buffered: true });
  state.observers.push(observer);
}

function supportsPerformanceEntry(entryType: string): boolean {
  if (typeof PerformanceObserver === 'undefined') {
    return false;
  }

  return PerformanceObserver.supportedEntryTypes.includes(entryType);
}

function serializePerformanceEntry(
  entry: PerformanceEntry,
): Record<string, unknown> {
  return {
    name: entry.name,
    entryType: entry.entryType,
    startTime: Math.round(entry.startTime),
    duration: Math.round(entry.duration),
  };
}

function reportCLS(metric: CLSMetricWithAttribution): void {
  emitVitalMetric(metric, metric.attribution.largestShiftTarget, {
    largestShiftTime: roundOptional(metric.attribution.largestShiftTime),
    largestShiftValue: metric.attribution.largestShiftValue,
    loadState: metric.attribution.loadState,
  });
}

function reportLCP(metric: LCPMetricWithAttribution): void {
  emitVitalMetric(metric, metric.attribution.target, {
    elementRenderDelay: roundOptional(metric.attribution.elementRenderDelay),
    resourceLoadDelay: roundOptional(metric.attribution.resourceLoadDelay),
    resourceLoadDuration: roundOptional(
      metric.attribution.resourceLoadDuration,
    ),
    timeToFirstByte: roundOptional(metric.attribution.timeToFirstByte),
  });
}

function reportINP(metric: INPMetricWithAttribution): void {
  emitVitalMetric(metric, metric.attribution.interactionTarget, {
    inputDelay: roundOptional(metric.attribution.inputDelay),
    interactionTime: roundOptional(metric.attribution.interactionTime),
    interactionType: metric.attribution.interactionType,
    loadState: metric.attribution.loadState,
    processingDuration: roundOptional(metric.attribution.processingDuration),
    presentationDelay: roundOptional(metric.attribution.presentationDelay),
  });
}

function emitVitalMetric(
  metric: MetricWithAttribution,
  selector: string | undefined,
  attribution: Record<string, unknown>,
): void {
  emit(`vital:${metric.name}`, {
    id: metric.id,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationId: metric.navigationId,
    navigationType: metric.navigationType,
    ...optionalField('selector', selector),
    attribution: definedFields(attribution),
  });
  renderVitalsHud(metric.name, metric.value);
}

function selectorForNode(node: Node | null): string | undefined {
  return node instanceof Element ? selectorForElement(node) : undefined;
}

function roundOptional(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value);
}

function optionalField(
  key: string,
  value: string | undefined,
): Record<string, string> {
  return value ? { [key]: value } : {};
}

function definedFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

function flags(): ProbeFlags {
  return window.__REPRO_FLAGS__ ?? {};
}

function renderCursorRipple(point: Point): void {
  if (!flags().cursorRipples || !state.root) {
    return;
  }

  const ripple = document.createElement('span');
  applyBadgeStyles(ripple, point);
  ripple.textContent = '*';
  state.root.append(ripple);
  window.setTimeout(() => {
    ripple.remove();
  }, 350);
}

function renderKeystrokeBadge(key: string): void {
  if (!flags().keystrokeBadges || !state.root) {
    return;
  }

  const badge = document.createElement('span');
  applyBadgeStyles(badge);
  badge.textContent = key;
  state.root.append(badge);
  window.setTimeout(() => {
    badge.remove();
  }, 900);
}

function renderVitalsHud(metric: string, value: number): void {
  if (!flags().vitalsHud || !state.root) {
    return;
  }

  const hud = document.createElement('output');
  applyBadgeStyles(hud);
  hud.textContent = `${metric}: ${String(Math.round(value))}`;
  state.root.append(hud);
}

function renderFreezeBadge(duration: number): void {
  if (!flags().freezeBadge || !state.root) {
    return;
  }

  const badge = document.createElement('output');
  applyBadgeStyles(badge);
  badge.textContent = `Freeze ${String(Math.round(duration))}ms`;
  state.root.append(badge);
}

function renderA11yOverlays(): void {
  if (!flags().a11yOverlays || !state.root) {
    return;
  }

  const badge = document.createElement('output');
  applyBadgeStyles(badge);
  badge.textContent = 'A11y overlay ready';
  state.root.append(badge);
}

function applyBadgeStyles(element: HTMLElement, point?: Point): void {
  element.style.position = 'fixed';
  element.style.pointerEvents = 'none';
  element.style.padding = '2px 6px';
  element.style.borderRadius = '999px';
  element.style.background = 'rgba(0, 0, 0, 0.72)';
  element.style.color = '#fff';
  element.style.font = '12px sans-serif';

  if (point) {
    element.style.left = `${String(point.x)}px`;
    element.style.top = `${String(point.y)}px`;
    return;
  }

  element.style.right = '8px';
  element.style.top = '8px';
}

try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    attachWhenReady();
  }
} catch {
  // Probe bootstrap is best effort and must never break the host page.
}
