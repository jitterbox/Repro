import type { SceneRect, ScenePlan } from '@jitterbox/repro-contracts';

/** Rectilinear visibility graph: leaders may touch boundaries but not enter protected areas. */
export function routeLeader(
  start: { x: number; y: number },
  end: { x: number; y: number },
  obstacles: SceneRect[],
): string {
  const inside = (p: { x: number; y: number }, r: SceneRect) =>
    p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
  const blocks = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    obstacles.some((r) =>
      a.x === b.x
        ? a.x > r.x &&
          a.x < r.x + r.width &&
          Math.max(a.y, b.y) > r.y &&
          Math.min(a.y, b.y) < r.y + r.height
        : a.y > r.y &&
          a.y < r.y + r.height &&
          Math.max(a.x, b.x) > r.x &&
          Math.min(a.x, b.x) < r.x + r.width,
    );
  // Slab intersection works for diagonal leaders as well as axis-aligned ones.
  const crosses = (r: SceneRect) => {
    let lo = 0,
      hi = 1;
    for (const axis of ['x', 'y'] as const) {
      const delta = end[axis] - start[axis];
      const lower = r[axis] + 0.001;
      const upper = r[axis] + (axis === 'x' ? r.width : r.height) - 0.001;
      if (delta === 0) {
        if (start[axis] <= lower || start[axis] >= upper) return false;
      } else {
        const a = (lower - start[axis]) / delta,
          b = (upper - start[axis]) / delta;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      }
    }
    return lo < hi;
  };
  if (!obstacles.some(crosses))
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...obstacles.flatMap((r) => [r.x - 2, r.x + r.width + 2]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...obstacles.flatMap((r) => [r.y - 2, r.y + r.height + 2]),
    ]),
  ].sort((a, b) => a - b);
  const key = (x: number, y: number) => `${x}/${y}`;
  const nodes = new Map<string, { x: number; y: number }>();
  for (const x of xs)
    for (const y of ys) {
      const p = { x, y };
      if (!obstacles.some((r) => inside(p, r))) nodes.set(key(x, y), p);
    }
  const first = key(start.x, start.y),
    last = key(end.x, end.y),
    cost = new Map([[first, 0]]),
    previous = new Map<string, string>(),
    pending = new Set([first]);
  while (pending.size) {
    let current = '';
    let best = Infinity;
    for (const id of pending) {
      const c = cost.get(id) ?? Infinity;
      if (c < best) {
        best = c;
        current = id;
      }
    }
    if (current === last) break;
    pending.delete(current);
    const p = nodes.get(current);
    if (!p) break;
    const xi = xs.indexOf(p.x),
      yi = ys.indexOf(p.y);
    for (const [x, y] of [
      [xs[xi - 1], p.y],
      [xs[xi + 1], p.y],
      [p.x, ys[yi - 1]],
      [p.x, ys[yi + 1]],
    ]) {
      if (x === undefined || y === undefined) continue;
      const id = key(x, y),
        q = nodes.get(id);
      if (!q || blocks(p, q)) continue;
      const next = best + Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + 0.01;
      if (next < (cost.get(id) ?? Infinity)) {
        cost.set(id, next);
        previous.set(id, current);
        pending.add(id);
      }
    }
  }
  if (!cost.has(last)) throw new Error('No unobstructed leader route');
  const path = [end];
  let id = last;
  while (id !== first) {
    const prev = previous.get(id);
    if (!prev) throw new Error('Incomplete leader route');
    const p = nodes.get(prev);
    if (!p) throw new Error('Missing route point');
    path.push(p);
    id = prev;
  }
  path.reverse();
  return path.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
}

export interface PanelBox extends SceneRect {
  id: string;
  kind: string;
  startMs: number;
  endMs: number;
  anchor?: { x: number; y: number };
}
export interface ProtectedBox extends SceneRect {
  startMs: number;
  endMs: number;
}
export interface PanelPlacement extends SceneRect {
  id: string;
  zone: 'gutter' | 'header' | 'overlay';
  leader?: string;
}
export interface PanelBeat {
  startMs: number;
  endMs: number;
  panels: PanelPlacement[];
  protected: SceneRect[];
}

/** Pure, seek-independent layout. Measurements come from the loaded, pinned fonts. */
export function planPanelLayout(
  scene: ScenePlan,
  cards: PanelBox[],
  protectedBoxes: ProtectedBox[],
) {
  const { style, layout, sourceOrigin: origin } = scene;
  const gap = style.cardGap;
  const pad = layout.protectedPadding;
  const duration = scene.segments.reduce((n, s) => n + s.outDurationMs, 0);
  const boundaries = [
    ...new Set([0, duration, ...cards.flatMap((c) => [c.startMs, c.endMs])]),
  ].sort((a, b) => a - b);
  const retired: Record<string, number> = {};
  const beats: PanelBeat[] = [];
  const inflate = (r: SceneRect, n: number): SceneRect => ({
    x: r.x - n,
    y: r.y - n,
    width: r.width + n * 2,
    height: r.height + n * 2,
  });
  const overlaps = (a: SceneRect, b: SceneRect) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;
  const hitsLine = (r: SceneRect, path: string) => {
    const values =
      path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    for (let i = 2; i < values.length - 1; i += 2) {
      const a = { x: values[i - 2] ?? 0, y: values[i - 1] ?? 0 },
        b = { x: values[i] ?? 0, y: values[i + 1] ?? 0 };
      let lo = 0,
        hi = 1;
      for (const axis of ['x', 'y'] as const) {
        const delta = b[axis] - a[axis],
          lower = r[axis],
          upper = lower + (axis === 'x' ? r.width : r.height);
        if (delta === 0) {
          if (a[axis] <= lower || a[axis] >= upper) {
            hi = -1;
            break;
          }
        } else {
          const x = (lower - a[axis]) / delta,
            y = (upper - a[axis]) / delta;
          lo = Math.max(lo, Math.min(x, y));
          hi = Math.min(hi, Math.max(x, y));
        }
      }
      if (lo < hi) return true;
    }
    return false;
  };
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i] ?? 0,
      endMs = boundaries[i + 1] ?? 0;
    const active = cards.filter(
      (c) =>
        c.startMs <= startMs &&
        c.endMs > startMs &&
        retired[c.id] === undefined,
    );
    const protectedRects = protectedBoxes
      .filter((r) => r.startMs < endMs && r.endMs > startMs)
      .map((r) => inflate(r, pad));
    const permanent = [...layout.protectedRegions, ...scene.privacyMasks].map(
      (r) => inflate({ ...r, x: origin.x + r.x, y: origin.y + r.y }, pad),
    );
    protectedRects.push(...permanent);
    const place = (allowOverlay: boolean): PanelPlacement[] | null => {
      const placed: PanelPlacement[] = [];
      const ordered = [...active].sort(
        (a, b) =>
          Number(Boolean(b.anchor)) - Number(Boolean(a.anchor)) ||
          Number(['data-panel', 'app-version'].includes(a.kind)) -
            Number(['data-panel', 'app-version'].includes(b.kind)) ||
          a.startMs - b.startMs ||
          a.id.localeCompare(b.id),
      );
      for (const card of ordered) {
        const safe = (r: SceneRect) =>
          r.x >= style.outerInset &&
          r.y >= style.outerInset &&
          r.x + r.width <= scene.output.width - style.outerInset &&
          r.y + r.height <= scene.output.height - style.outerInset * 2 &&
          !placed.some((p) => overlaps(inflate(p, gap - 0.01), r)) &&
          !protectedRects.some((p) => overlaps(p, r));
        const gutterX = origin.x + scene.viewport.width + style.gutterGap;
        const candidates: PanelPlacement[] = [];
        const gutterTop = layout.useHeaderSpace ? style.outerInset : origin.y;
        const ys = [
          gutterTop,
          ...placed
            .filter((p) => p.zone === 'gutter')
            .map((p) => p.y + p.height + gap),
          // A steep connector can block the slot immediately below its card.
          // Try below its source attachment, and below other gutter obstacles.
          ...ordered.flatMap((p) => (p.anchor ? [p.anchor.y + pad] : [])),
          ...protectedRects
            .filter(
              (r) => r.x < gutterX + card.width && r.x + r.width > gutterX,
            )
            .map((r) => r.y + r.height + gap),
        ];
        for (const y of ys)
          candidates.push({
            id: card.id,
            zone: 'gutter',
            x: gutterX,
            y,
            width: card.width,
            height: card.height,
          });
        const persistent = ['data-panel', 'app-version'].includes(card.kind);
        if (
          persistent &&
          layout.useHeaderSpace &&
          card.height + style.outerInset + gap <= origin.y
        ) {
          // Right-aligned lanes in the unused title row, with the same grid and gap.
          for (
            let x = origin.x + scene.viewport.width - card.width;
            x >= origin.x;
            x -= card.width + gap
          )
            candidates.push({
              id: card.id,
              zone: 'header',
              x,
              y: style.outerInset,
              width: card.width,
              height: card.height,
            });
        }
        if (persistent && allowOverlay) {
          for (const corner of layout.overlayCornerOrder) {
            const x = corner.endsWith('right')
              ? origin.x + scene.viewport.width - pad - card.width
              : origin.x + pad;
            const top = origin.y + pad,
              bottom = origin.y + scene.viewport.height - pad - card.height;
            const fromBottom = corner.startsWith('bottom');
            for (const y of [
              fromBottom ? bottom : top,
              ...placed
                .filter((p) => p.zone === 'overlay' && p.x === x)
                .map((p) =>
                  fromBottom ? p.y - gap - card.height : p.y + p.height + gap,
                ),
            ]) {
              if (
                x >= origin.x + pad &&
                y >= top &&
                y + card.height <= origin.y + scene.viewport.height - pad
              )
                candidates.push({
                  id: card.id,
                  zone: 'overlay',
                  x,
                  y,
                  width: card.width,
                  height: card.height,
                });
            }
          }
        }
        let chosen: PanelPlacement | undefined;
        for (const candidate of candidates) {
          if (!safe(candidate)) continue;
          // Persistent overflow must not spend existing connector clearance.
          // Try another corner instead of forcing a clean leader into a detour.
          // Gutter packing can still reroute leaders to avoid unnecessary gaps.
          if (
            candidate.zone !== 'gutter' &&
            placed.some(
              (p) => p.leader && hitsLine(inflate(candidate, pad), p.leader),
            )
          )
            continue;
          const proposed = [...placed, candidate];
          const routes = new Map<string, string>();
          try {
            for (const panel of proposed) {
              const anchor = ordered.find((c) => c.id === panel.id)?.anchor;
              if (!anchor) continue;
              // Reconsider earlier leaders when a later panel consumes their
              // clearance. Preserve a direct line whenever it remains safe.
              const path =
                panel !== candidate &&
                panel.leader &&
                !hitsLine(inflate(candidate, pad), panel.leader)
                  ? panel.leader
                  : routeLeader(
                      anchor,
                      { x: panel.x, y: panel.y + panel.height / 2 },
                      [
                        ...protectedRects.filter(
                          (r) =>
                            !(
                              anchor.x >= r.x &&
                              anchor.x <= r.x + r.width &&
                              anchor.y >= r.y &&
                              anchor.y <= r.y + r.height
                            ),
                        ),
                        ...proposed
                          .filter((p) => p.id !== panel.id)
                          .map((p) => inflate(p, pad)),
                      ],
                    );
              const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
              if (
                numbers.some(
                  (n, index) =>
                    n < 0 ||
                    n > (index % 2 ? scene.output.height : scene.output.width),
                )
              )
                throw new Error('Leader outside output');
              routes.set(panel.id, path);
            }
          } catch {
            continue;
          }
          for (const panel of proposed) {
            const path = routes.get(panel.id);
            if (path) panel.leader = path;
          }
          chosen = candidate;
          break;
        }
        if (!chosen) return null;
        placed.push(chosen);
      }
      return placed;
    };
    let panels = place(false);
    if (!panels && layout.retireSteps) {
      const oldSteps = active
        .filter(
          (c) =>
            ['marker', 'step'].includes(c.kind) &&
            startMs - c.startMs >=
              layout.minStepVisibleMs +
                scene.timing.entryMs +
                scene.timing.exitMs,
        )
        .sort((a, b) => a.startMs - b.startMs);
      for (const old of oldSteps) {
        retired[old.id] = startMs;
        active.splice(active.indexOf(old), 1);
        panels = place(false);
        if (panels) break;
      }
    }
    if (!panels && layout.overlayPanels === 'as-needed') panels = place(true);
    if (!panels)
      throw new Error(
        `No safe panel layout at ${startMs}ms. Preserve required explanations; split the beat or reduce simultaneous treatments. Active: ${active.map((c) => c.id).join(', ')}`,
      );
    beats.push({ startMs, endMs, panels, protected: protectedRects });
  }
  return { beats, retired };
}
