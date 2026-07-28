export type GeometrySeverity = 'ignore' | 'info' | 'warn' | 'critical';
export type GeometryKind =
  'moved' | 'resized' | 'appeared' | 'disappeared' | 'restyled' | 'unchanged';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ElementSnapshot {
  readonly path: string;
  readonly bounds: Rect;
  readonly testId?: string;
  readonly text?: string;
  readonly styles?: Record<string, string>;
}

export interface GeometryDelta {
  readonly kind: GeometryKind;
  readonly severity: GeometrySeverity;
  readonly key: string;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
  readonly caption: string;
  readonly before?: ElementSnapshot;
  readonly after?: ElementSnapshot;
}

export function diffGeometry(input: {
  readonly before: readonly ElementSnapshot[];
  readonly after: readonly ElementSnapshot[];
}): readonly GeometryDelta[] {
  const matches = matchElements(input.before, input.after);
  const deltas = matches.map(deltaForMatch);

  return deltas.filter((delta) => delta.kind !== 'unchanged');
}

export function classifySeverity(value: number): GeometrySeverity {
  const size = Math.abs(value);

  if (size < 1) {
    return 'ignore';
  }

  if (size <= 3) {
    return 'info';
  }

  return size <= 10 ? 'warn' : 'critical';
}

interface ElementMatch {
  readonly before?: ElementSnapshot;
  readonly after?: ElementSnapshot;
}

function matchElements(
  before: readonly ElementSnapshot[],
  after: readonly ElementSnapshot[],
): readonly ElementMatch[] {
  const unmatchedBefore = new Set(before.map((_, index) => index));
  const unmatchedAfter = new Set(after.map((_, index) => index));
  const matches: ElementMatch[] = [];

  collectKeyMatches(matches, before, after, unmatchedBefore, unmatchedAfter);
  collectLcsMatches(matches, before, after, unmatchedBefore, unmatchedAfter);
  collectUnmatched(matches, before, after, unmatchedBefore, unmatchedAfter);

  return matches;
}

function collectKeyMatches(
  matches: ElementMatch[],
  before: readonly ElementSnapshot[],
  after: readonly ElementSnapshot[],
  unmatchedBefore: Set<number>,
  unmatchedAfter: Set<number>,
): void {
  for (const keyFn of [testIdKey, pathKey, contentKey]) {
    collectByKey(
      matches,
      before,
      after,
      unmatchedBefore,
      unmatchedAfter,
      keyFn,
    );
  }
}

function collectByKey(
  matches: ElementMatch[],
  before: readonly ElementSnapshot[],
  after: readonly ElementSnapshot[],
  unmatchedBefore: Set<number>,
  unmatchedAfter: Set<number>,
  keyFn: (element: ElementSnapshot) => string | null,
): void {
  const left = uniqueIndex(before, unmatchedBefore, keyFn);
  const right = uniqueIndex(after, unmatchedAfter, keyFn);

  for (const [key, beforeIndex] of left) {
    const afterIndex = right.get(key);

    if (afterIndex === undefined) {
      continue;
    }

    const beforeElement = before[beforeIndex];
    const afterElement = after[afterIndex];

    if (beforeElement === undefined || afterElement === undefined) {
      continue;
    }

    matches.push({ after: afterElement, before: beforeElement });
    unmatchedBefore.delete(beforeIndex);
    unmatchedAfter.delete(afterIndex);
  }
}

function collectLcsMatches(
  matches: ElementMatch[],
  before: readonly ElementSnapshot[],
  after: readonly ElementSnapshot[],
  unmatchedBefore: Set<number>,
  unmatchedAfter: Set<number>,
): void {
  const left = [...unmatchedBefore].map((index) => before[index]);
  const right = [...unmatchedAfter].map((index) => after[index]);
  const pairs = lcsPaths(left, right);
  const beforeIndexes = [...unmatchedBefore];
  const afterIndexes = [...unmatchedAfter];

  for (const pair of pairs) {
    const beforeIndex = beforeIndexes[pair.left];
    const afterIndex = afterIndexes[pair.right];

    if (beforeIndex === undefined || afterIndex === undefined) {
      continue;
    }

    const beforeElement = before[beforeIndex];
    const afterElement = after[afterIndex];

    if (beforeElement === undefined || afterElement === undefined) {
      continue;
    }

    matches.push({ after: afterElement, before: beforeElement });
    unmatchedBefore.delete(beforeIndex);
    unmatchedAfter.delete(afterIndex);
  }
}

function collectUnmatched(
  matches: ElementMatch[],
  before: readonly ElementSnapshot[],
  after: readonly ElementSnapshot[],
  unmatchedBefore: Set<number>,
  unmatchedAfter: Set<number>,
): void {
  for (const index of unmatchedBefore) {
    const element = before[index];

    if (element !== undefined) {
      matches.push({ before: element });
    }
  }

  for (const index of unmatchedAfter) {
    const element = after[index];

    if (element !== undefined) {
      matches.push({ after: element });
    }
  }
}

function deltaForMatch(match: ElementMatch): GeometryDelta {
  if (match.before === undefined) {
    return appearedDelta(match.after);
  }

  if (match.after === undefined) {
    return disappearedDelta(match.before);
  }

  return changedDelta(match.before, match.after);
}

function changedDelta(
  before: ElementSnapshot,
  after: ElementSnapshot,
): GeometryDelta {
  const dx = after.bounds.x - before.bounds.x;
  const dy = after.bounds.y - before.bounds.y;
  const dw = after.bounds.w - before.bounds.w;
  const dh = after.bounds.h - before.bounds.h;
  const maxDelta = Math.max(
    Math.abs(dx),
    Math.abs(dy),
    Math.abs(dw),
    Math.abs(dh),
  );
  const styleChanged = stylesKey(before) !== stylesKey(after);
  const kind = geometryKind(dx, dy, dw, dh, styleChanged);

  return {
    after,
    before,
    caption: dimensionCaption({ dh, dw, dx, dy }),
    dh,
    dw,
    dx,
    dy,
    key: elementKey(before),
    kind,
    severity: classifySeverity(styleChanged && maxDelta < 1 ? 1 : maxDelta),
  };
}

function appearedDelta(after: ElementSnapshot | undefined): GeometryDelta {
  const element = requireElement(after);

  return {
    after: element,
    caption: `appeared ${rectCaption(element.bounds)}`,
    dh: element.bounds.h,
    dw: element.bounds.w,
    dx: element.bounds.x,
    dy: element.bounds.y,
    key: elementKey(element),
    kind: 'appeared',
    severity: 'critical',
  };
}

function disappearedDelta(before: ElementSnapshot | undefined): GeometryDelta {
  const element = requireElement(before);

  return {
    before: element,
    caption: `disappeared ${rectCaption(element.bounds)}`,
    dh: -element.bounds.h,
    dw: -element.bounds.w,
    dx: -element.bounds.x,
    dy: -element.bounds.y,
    key: elementKey(element),
    kind: 'disappeared',
    severity: 'critical',
  };
}

function geometryKind(
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  styleChanged: boolean,
): GeometryKind {
  if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dw), Math.abs(dh)) < 1) {
    return styleChanged ? 'restyled' : 'unchanged';
  }

  return Math.abs(dw) >= 1 || Math.abs(dh) >= 1 ? 'resized' : 'moved';
}

function dimensionCaption(input: {
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
}): string {
  return [
    `Δx ${formatDelta(input.dx)}`,
    `Δy ${formatDelta(input.dy)}`,
    `Δw ${formatDelta(input.dw)}`,
    `Δh ${formatDelta(input.dh)}`,
  ].join(', ');
}

function lcsPaths(
  before: readonly (ElementSnapshot | undefined)[],
  after: readonly (ElementSnapshot | undefined)[],
): readonly { readonly left: number; readonly right: number }[] {
  const pairs: { left: number; right: number }[] = [];
  const usedRight = new Set<number>();

  for (let left = 0; left < before.length; left += 1) {
    const right = after.findIndex(
      (element, index) =>
        !usedRight.has(index) && pathKey(element) === pathKey(before[left]),
    );

    if (right >= 0) {
      pairs.push({ left, right });
      usedRight.add(right);
    }
  }

  return pairs;
}

function uniqueIndex(
  elements: readonly ElementSnapshot[],
  indexes: Set<number>,
  keyFn: (element: ElementSnapshot) => string | null,
): Map<string, number> {
  const output = new Map<string, number>();
  const duplicates = new Set<string>();

  for (const index of indexes) {
    const element = elements[index];
    const key = element === undefined ? null : keyFn(element);

    if (key === null || duplicates.has(key)) {
      continue;
    }

    if (output.has(key)) {
      duplicates.add(key);
      continue;
    }

    output.set(key, index);
  }

  for (const key of duplicates) {
    output.delete(key);
  }

  return output;
}

function elementKey(element: ElementSnapshot): string {
  return (
    testIdKey(element) ?? pathKey(element) ?? contentKey(element) ?? 'element'
  );
}

function testIdKey(element: ElementSnapshot): string | null {
  return element.testId === undefined ? null : `testid:${element.testId}`;
}

function pathKey(element: ElementSnapshot | undefined): string | null {
  return element === undefined ? null : `path:${element.path}`;
}

function contentKey(element: ElementSnapshot): string | null {
  const text = element.text?.trim().toLowerCase();

  return text === undefined || text === '' ? null : `content:${text}`;
}

function stylesKey(element: ElementSnapshot): string {
  return JSON.stringify(element.styles ?? {});
}

function rectCaption(rect: Rect): string {
  return `${formatDelta(rect.w)}x${formatDelta(rect.h)}`;
}

function formatDelta(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}px`;
}

function requireElement(element: ElementSnapshot | undefined): ElementSnapshot {
  if (element === undefined) {
    throw new Error('geometry match was missing an element');
  }

  return element;
}
