import { it, expect } from 'vitest';
import { routeLeader } from './scene-layout.js';
it('routes leaders around protected application regions', () => {
  const route = routeLeader({ x: 0, y: 10 }, { x: 100, y: 10 }, [
    { x: 40, y: 0, width: 20, height: 20 },
  ]);
  expect(route).toMatch(/^M 0 10/);
  expect(route).toMatch(/L 100 10$/);
  expect(route).toMatch(/-2|22/);
});
it('fails closed when a leader originates inside a protected region', () => {
  expect(() =>
    routeLeader({ x: 10, y: 10 }, { x: 100, y: 10 }, [
      { x: 0, y: 0, width: 20, height: 20 },
    ]),
  ).toThrow();
});
it('uses a direct diagonal when the space between edge centers is clear', () => {
  expect(routeLeader({ x: 100, y: 50 }, { x: 420, y: 230 }, [])).toBe(
    'M 100 50 L 420 230',
  );
});
it('routes a diagonal around another panel without changing either attachment', () => {
  const path = routeLeader({ x: 0, y: 0 }, { x: 100, y: 100 }, [
    { x: 40, y: 40, width: 20, height: 20 },
  ]);
  expect(path).not.toBe('M 0 0 L 100 100');
  expect(path).toMatch(/^M 0 0/);
  expect(path).toMatch(/L 100 100$/);
});
