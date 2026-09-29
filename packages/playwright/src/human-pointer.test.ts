import { it, expect } from 'vitest';
import { humanApproach } from './human-pointer.js';
it('records a repeatable curved approach with slower arrival and departure', () => {
  const from = { x: 20, y: 80 },
    to = { x: 400, y: 80 };
  const points = humanApproach(from, to);
  expect(points).toEqual(humanApproach(from, to));
  expect(points.at(-1)?.x).toBe(to.x);
  expect(points.at(-1)?.y).toBeCloseTo(to.y);
  expect((points[15] ?? from).y).toBeGreaterThan(from.y + 20);
  const distance = (a: typeof from, b: typeof from) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  expect(distance(from, points[0] ?? from)).toBeLessThan(
    distance(points[14] ?? from, points[15] ?? from),
  );
  expect(distance(points[30] ?? from, points[31] ?? from)).toBeLessThan(
    distance(points[14] ?? from, points[15] ?? from),
  );
});
