import { expect, it } from 'vitest';
import { parseScenePlan } from '@jitterbox/repro-contracts';
import { planPanelLayout, type PanelBox } from './scene-layout.js';
const scene = (layout = {}) =>
  parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: 1280, height: 720 },
    output: { width: 1688, height: 864, fps: 30 },
    sourceOrigin: { x: 24, y: 96 },
    layout,
    segments: [
      {
        id: 'p',
        kind: 'play',
        sourceStartMs: 0,
        rate: 1,
        outStartMs: 0,
        outDurationMs: 20000,
      },
    ],
    cues: [],
  });
const card = (
  id: string,
  kind: string,
  height: number,
  startMs = 0,
): PanelBox => ({
  id,
  kind,
  x: 0,
  y: 0,
  width: 336,
  height,
  startMs,
  endMs: 20000,
});
it('packs the full gutter from the top and uses no overlay while it fits', () => {
  const result = planPanelLayout(
    scene(),
    [card('data', 'data-panel', 160), card('step', 'marker', 120)],
    [],
  );
  expect(result.beats[0]?.panels.every((p) => p.zone === 'gutter')).toBe(true);
  expect(Math.min(...(result.beats[0]?.panels ?? []).map((p) => p.y))).toBe(24);
});
it('retires oldest steps only after five fully visible seconds; markers and labels share retirement', () => {
  const result = planPanelLayout(
    scene(),
    [
      card('old', 'marker', 240),
      card('newer', 'marker', 240, 2000),
      card('new', 'marker', 240, 7000),
      card('data', 'data-panel', 160),
    ],
    [],
  );
  expect(result.retired).toEqual({ old: 7000 });
  expect(result.beats.at(-1)?.panels.map((p) => p.id)).not.toContain('old');
  expect(result.beats[0]?.panels.map((p) => p.id)).toContain('old');
});
it('uses a safe aligned corner for overflow, avoiding targets and connectors', () => {
  const c = card('detail', 'magnifier', 480);
  c.anchor = { x: 1100, y: 200 };
  const result = planPanelLayout(
    scene({ retireSteps: false }),
    [c, card('state', 'data-panel', 380)],
    [{ x: 1000, y: 108, width: 280, height: 330, startMs: 0, endMs: 20000 }],
  );
  const data = result.beats[0]?.panels.find((p) => p.id === 'state');
  if (!data) throw new Error('Missing state panel');
  expect(data.zone).toBe('overlay');
  expect(data.x).toBe(36); // top-right is protected; choose top-left
  expect(data.y).toBe(108);
});
it('never mode fails instead of covering evidence, hiding required panels or growing the canvas', () => {
  expect(() =>
    planPanelLayout(
      scene({ overlayPanels: 'never', retireSteps: false }),
      [card('detail', 'magnifier', 480), card('state', 'data-panel', 380)],
      [],
    ),
  ).toThrow('No safe panel layout');
});
it('protects targets that appear later in a beat and does not retire unread steps', () => {
  const s = scene({
    protectedRegions: [{ x: 0, y: 0, width: 1280, height: 720 }],
  });
  expect(() =>
    planPanelLayout(
      s,
      [card('unread', 'marker', 480), card('state', 'data-panel', 380, 1000)],
      [],
    ),
  ).toThrow('No safe panel layout');
});
it('fits a thin panel in the unused header, outside the measured title', () => {
  const result = planPanelLayout(
    scene(),
    [card('tall', 'magnifier', 750), card('version', 'app-version', 48)],
    [{ x: 24, y: 18, width: 600, height: 52, startMs: 0, endMs: 20000 }],
  );
  expect(result.beats[0]?.panels.find((p) => p.id === 'version')?.zone).toBe(
    'header',
  );
});
it('gives the same layouts on repeated compilation for deterministic random seeking', () => {
  const cards = [
    card('a', 'marker', 280),
    card('b', 'marker', 280, 6000),
    card('c', 'data-panel', 320),
  ];
  expect(planPanelLayout(scene(), cards, [])).toEqual(
    planPanelLayout(scene(), cards, []),
  );
});

it('stacks overflow panels along one corner without changing a mobile viewport', () => {
  const s = scene({ retireSteps: false });
  s.viewport = { width: 393, height: 852 };
  s.output = { width: 802, height: 1028, fps: 30 };
  s.sourceOrigin.y = 128;
  const panels =
    planPanelLayout(
      s,
      [
        card('detail', 'magnifier', 930),
        card('a', 'data-panel', 160),
        card('b', 'data-panel', 180),
      ],
      [],
    ).beats[0]?.panels ?? [];
  const a = panels.find((p) => p.id === 'a'),
    b = panels.find((p) => p.id === 'b');
  expect(a?.zone).toBe('overlay');
  expect(b?.zone).toBe('overlay');
  expect(a?.x).toBe(b?.x);
  expect(b?.y).toBe((a?.y ?? 0) + (a?.height ?? 0) + s.style.cardGap);
  expect(s.viewport.width).toBe(393);
});

it('reroutes a steep connector so mobile panels can pack tightly', () => {
  const s = scene();
  s.viewport = { width: 393, height: 852 };
  s.output = { width: 802, height: 1028, fps: 30 };
  s.sourceOrigin.y = 128;
  const detail = card('detail', 'callout', 158);
  detail.anchor = { x: 413, y: 384 };
  const result = planPanelLayout(
    s,
    [detail, card('step', 'step', 72), card('data', 'data-panel', 231)],
    [],
  );
  expect(result.beats[0]?.panels.every((p) => p.zone === 'gutter')).toBe(true);
  expect(result.beats[0]?.panels.find((p) => p.id === 'step')?.y).toBe(198);
  expect(
    result.beats[0]?.panels.find((p) => p.id === 'detail')?.leader?.split('L')
      .length,
  ).toBeGreaterThan(2);
});
