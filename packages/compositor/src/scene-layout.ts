import type { SceneRect } from '@repro/contracts';

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
