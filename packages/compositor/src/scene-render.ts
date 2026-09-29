import { headlessShellPath } from './browser-path.js';
import { actionWave } from './scene-audio.js';
import { routeLeader } from './scene-layout.js';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runSceneWorker } from './scene-process.js';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCaptureSession,
  initializeSession,
  captureFrame,
  closeCaptureSession,
  getCapturePerfSummary,
} from '@hyperframes/engine';
import {
  parseScenePlan,
  sceneSourceAt,
  type ScenePlan,
  type SceneRect,
} from '@jitterbox/repro-contracts';
import { runProcess, h264Profile } from '@jitterbox/repro-core';

export interface SceneSourceFrame {
  id: string;
  path: string;
  pageId: string;
  timeMs: number;
  sha256: string;
  checkpoint?: string;
  originalSha256?: string;
}
const require = createRequire(import.meta.url);
const digest = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');

/** Explicit source lookup, never HTMLVideoElement.currentTime or synthetic interpolation. */
export function selectSceneFrame(
  scene: ScenePlan,
  sources: SceneSourceFrame[],
  outputMs: number,
) {
  const position = sceneSourceAt(scene, outputMs);
  if (!position) return null;
  const { segment, sourceMs } = position;
  const source = segment.checkpoint
    ? sources.find((s) => s.checkpoint === segment.checkpoint)
    : sources
        .filter(
          (s) =>
            !s.checkpoint &&
            (!segment.pageId || s.pageId === segment.pageId) &&
            s.timeMs <= sourceMs,
        )
        .sort((a, b) => a.timeMs - b.timeMs)
        .at(-1);
  if (!source)
    throw new Error(`No source frame for ${segment.id} at ${sourceMs}`);
  return { source, sourceMs, segmentId: segment.id };
}

export function magnifierRegion(
  target: SceneRect,
  viewport: { width: number; height: number },
  factor: number,
  insetWidth = 312,
) {
  const width = Math.min(viewport.width, insetWidth / factor),
    height = Math.min(viewport.height, 176 / factor);
  return {
    x: Math.max(
      0,
      Math.min(
        viewport.width - width,
        target.width > width
          ? target.x - 24
          : target.x + target.width / 2 - width / 2,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        viewport.height - height,
        target.height > height
          ? target.y - 24
          : target.y + target.height / 2 - height / 2,
      ),
    ),
    width,
    height,
  };
}

// Serialized into a controlled composition. No page-provided code is evaluated.
function sceneRuntime(
  scene: ScenePlan,
  mapping: {
    asset: string;
    sourceMs: number | null;
    label: string;
    pageId: string;
  }[],
) {
  const required = <T>(value: T | null | undefined): T => {
    if (value === null || value === undefined)
      throw new Error('Missing scene element');
    return value;
  };
  const root = window as unknown as {
    __hf: { duration: number; seek: (time: number) => void };
    __hfWaitForSeekCompletion: () => Promise<void>;
    __reproLayout: () => unknown;
    __reproValidate: () => void;
  };
  const image = required(document.querySelector<HTMLImageElement>('#source'));
  const groups = Array.from(
    document.querySelectorAll<HTMLElement>('[data-cue]'),
  );
  const origin = scene.sourceOrigin;
  let pending = Promise.resolve();
  const sourceAt = (time: number) => {
    const s = scene.segments.find(
      (s) => time >= s.outStartMs && time < s.outStartMs + s.outDurationMs,
    );
    return s?.sourceStartMs === undefined
      ? null
      : s.sourceStartMs + (time - s.outStartMs) * s.rate;
  };
  const layout = () => {
    const occupied: { y: number; h: number; start: number; end: number }[] = [];
    const results: {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }[] = [];
    for (const group of [...groups].sort(
      (a, b) =>
        (b.dataset.kind === 'app-version'
          ? 2
          : Number(b.dataset.kind === 'marker')) -
        (a.dataset.kind === 'app-version'
          ? 2
          : Number(a.dataset.kind === 'marker')),
    )) {
      const cue = required(scene.cues.find((c) => c.id === group.dataset.cue));
      const card = group.querySelector<HTMLElement>('.card');
      if (!card || cue.kind === 'title') continue;
      const value = card.querySelector<HTMLElement>('.value');
      if (value) {
        let height = 0;
        for (const sample of cue.samples) {
          value.textContent = sample.text + (cue.unit ? ' ' + cue.unit : '');
          height = Math.max(height, value.getBoundingClientRect().height);
        }
        value.style.height = `${Math.max(88, height)}px`;
        value.textContent = 'No observation yet';
      }
      const h = card.getBoundingClientRect().height;
      let y = origin.y;
      for (;;) {
        const conflict = occupied.find(
          (o) =>
            cue.startMs < o.end &&
            o.start < cue.endMs &&
            y < o.y + o.h + scene.style.cardGap &&
            y + h + scene.style.cardGap > o.y,
        );
        if (!conflict) break;
        y = conflict.y + conflict.h + scene.style.cardGap;
      }
      if (y + h > scene.output.height - scene.style.outerInset * 2)
        throw new Error(`No readable space for required group ${cue.id}`);
      const x = origin.x + scene.viewport.width + scene.style.gutterGap;
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      occupied.push({ y, h, start: cue.startMs, end: cue.endMs });
      results.push({
        id: cue.id,
        x,
        y,
        width: scene.style.cardWidth,
        height: h,
      });
      const leader = group.querySelector<SVGPathElement>('.leader');
      if (leader && cue.target) {
        const region =
          cue.kind === 'magnifier'
            ? magnifierRegion(
                cue.target,
                scene.viewport,
                cue.magnification ?? 2,
                scene.style.cardWidth - scene.style.cardPadding * 2 - 5,
              )
            : cue.target;
        // Center of the visible outline's right edge, exactly on its stroke.
        let tx = Math.min(
          origin.x + scene.viewport.width,
          origin.x + region.x + region.width + 4,
        );
        const top = Math.max(origin.y, origin.y + region.y - 4);
        const bottom = Math.min(
          origin.y + scene.viewport.height,
          origin.y + region.y + region.height + 4,
        );
        let ty = (top + bottom) / 2;
        if (cue.kind === 'alignment' && cue.reference) {
          if ((cue.axis ?? 'x') === 'x') {
            tx = origin.x + Math.min(cue.target.x, cue.reference.x);
            ty =
              origin.y +
              (Math.min(cue.target.y, cue.reference.y) +
                Math.max(
                  cue.target.y + cue.target.height,
                  cue.reference.y + cue.reference.height,
                )) /
                2;
          } else {
            tx =
              origin.x +
              (Math.min(cue.target.x, cue.reference.x) +
                Math.max(
                  cue.target.x + cue.target.width,
                  cue.reference.x + cue.reference.width,
                )) /
                2;
            ty = origin.y + Math.min(cue.target.y, cue.reference.y);
          }
        }
        const obstacles = scene.cues
          .filter(
            (c) =>
              c.target &&
              c.id !== cue.id &&
              c.startMs < cue.endMs &&
              cue.startMs < c.endMs,
          )
          .map((c) => ({
            ...required(c.target),
            x: origin.x + required(c.target).x - 3,
            y: origin.y + required(c.target).y - 3,
            width: required(c.target).width + 6,
            height: required(c.target).height + 6,
          }));
        if (cue.kind === 'alignment') {
          for (const region of [cue.target, cue.reference])
            if (region)
              obstacles.push({
                ...region,
                x: origin.x + region.x,
                y: origin.y + region.y,
              });
        }
        leader.setAttribute(
          'd',
          routeLeader(
            { x: tx, y: ty },
            { x, y: y + h / 2 },
            obstacles.filter(
              (r) =>
                !(
                  tx > r.x &&
                  tx < r.x + r.width &&
                  ty > r.y &&
                  ty < r.y + r.height
                ),
            ),
          ),
        );
      }
    }
    const title = document.querySelector<HTMLElement>('.card.title');
    if (title && title.getBoundingClientRect().bottom + 12 > origin.y)
      throw new Error('Title overlaps the source viewport');
    return results;
  };
  root.__reproLayout = layout;
  root.__reproValidate = () => {
    const visible = groups.filter((g) => Number(g.style.opacity) > 0);
    const cards = visible.flatMap((g) => {
      const card = g.querySelector<HTMLElement>('.card');
      if (!card) return [];
      const r = card.getBoundingClientRect();
      if (
        r.x < 0 ||
        r.y < 0 ||
        r.right > scene.output.width ||
        r.bottom > scene.output.height ||
        card.scrollHeight > card.clientHeight + 1 ||
        card.scrollWidth > card.clientWidth + 1
      )
        throw new Error(
          `Clipped card: ${g.dataset.cue} ${JSON.stringify({ rect: { x: r.x, y: r.y, width: r.width, height: r.height }, scroll: [card.scrollWidth, card.scrollHeight], client: [card.clientWidth, card.clientHeight], output: scene.output })}`,
        );
      const leader = g.querySelector<SVGPathElement>('.leader');
      if (leader) {
        const endpoint = leader.getPointAtLength(leader.getTotalLength());
        if (
          Math.hypot(endpoint.x - r.left, endpoint.y - (r.top + r.height / 2)) >
          0.1
        )
          throw new Error(`Detached panel leader: ${g.dataset.cue}`);
        if (
          getComputedStyle(leader).stroke !==
          getComputedStyle(card).borderTopColor
        )
          throw new Error(`Mismatched treatment colors: ${g.dataset.cue}`);
      }
      if (g.dataset.kind === 'marker') {
        if (
          leader ||
          g.querySelector('.number')?.textContent !==
            g.querySelector('svg text')?.textContent
        )
          throw new Error(`Inconsistent numbered group: ${g.dataset.cue}`);
      }
      return [{ id: g.dataset.cue, rect: r }];
    });
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++) {
        const a = required(cards[i]),
          b = required(cards[j]);
        if (
          a.rect.left < b.rect.right + 8 &&
          b.rect.left < a.rect.right + 8 &&
          a.rect.top < b.rect.bottom + 8 &&
          b.rect.top < a.rect.bottom + 8
        )
          throw new Error(`Overlapping cards: ${a.id}/${b.id}`);
      }
  };
  const seek = (seconds: number) => {
    const t = seconds * 1000;
    const frame =
      mapping[
        Math.min(
          mapping.length - 1,
          Math.max(0, Math.round(seconds * scene.output.fps)),
        )
      ];
    const sourceMs = sourceAt(t);
    required(document.querySelector('#speed')).textContent = frame?.label ?? '';
    required(document.querySelector('#clock')).textContent =
      `SOURCE ${sourceMs === null ? '—' : (sourceMs / 1000).toFixed(3) + 's'}`;
    const samples = scene.cursorSamples.filter(
      (p) =>
        p.pageId === frame?.pageId && sourceMs !== null && p.timeMs <= sourceMs,
    );
    const position = samples.at(-1);
    const cursorLayer = required(
      document.querySelector<HTMLCanvasElement>('#cursor-layer'),
    );
    const ctx = required(cursorLayer.getContext('2d'));
    ctx.setTransform(scene.outputScale, 0, 0, scene.outputScale, 0, 0);
    ctx.clearRect(0, 0, scene.output.width, scene.output.height);
    if (position && sourceMs !== null) {
      const press = samples
        .filter((p) =>
          ['pointerdown', 'pointerup', 'pointercancel'].includes(p.phase),
        )
        .at(-1);
      const scale = press?.phase === 'pointerdown' ? 0.86 : 1;
      const trail = samples.filter((p) => p.timeMs >= sourceMs - 550);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = scene.style.cursorColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      trail.forEach((p, i) => {
        if (i) ctx.lineTo(origin.x + p.x, origin.y + p.y);
        else ctx.moveTo(origin.x + p.x, origin.y + p.y);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Redraw the complete vector cursor each seek, avoiding retained SVG raster caches.
      ctx.beginPath();
      [
        [0, 0],
        [0, 23],
        [6, 17],
        [11, 28],
        [16, 25],
        [11, 15],
        [20, 15],
      ].forEach(([x = 0, y = 0], i) => {
        const px = Math.round(origin.x + position.x) + x * scale,
          py = Math.round(origin.y + position.y) + y * scale;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      if (scene.cursorGlow) {
        ctx.strokeStyle = scene.style.cursorColor;
        ctx.lineWidth = 6;
        ctx.globalAlpha = 0.28;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#152638';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const group of groups) {
      const cue = required(scene.cues.find((c) => c.id === group.dataset.cue));
      const active = t >= cue.startMs && t < cue.endMs;
      const alpha =
        cue.kind === 'app-version'
          ? 1
          : Math.max(
              0,
              Math.min(
                1,
                (t - cue.startMs) / Math.max(1, scene.timing.entryMs),
                (cue.endMs - t) / Math.max(1, scene.timing.exitMs),
              ),
            );
      group.style.opacity = active ? String(alpha) : '0';
      for (const child of Array.from(group.children))
        (child as HTMLElement).style.opacity = group.style.opacity;
      if (cue.kind === 'pointer') {
        const point =
          cue.points.filter((p) => p.timeMs <= t).at(-1) ?? cue.points[0];
        if (point) {
          const ring = required(
            group.querySelector<SVGCircleElement>('circle'),
          );
          const age = t - cue.startMs;
          const glyph = group.querySelector<SVGTextElement>('.action-glyph');
          if (glyph) {
            glyph.setAttribute('x', String(origin.x + point.x + 22));
            glyph.setAttribute('y', String(origin.y + point.y - 18));
          }
          ring.setAttribute(
            'fill',
            cue.action === 'hold' ? `${scene.style.cursorColor}33` : 'none',
          );
          ring.setAttribute(
            'stroke-dasharray',
            cue.action === 'right-click'
              ? '3 3'
              : cue.action === 'cancel'
                ? '1 4'
                : 'none',
          );
          ring.setAttribute('cx', String(origin.x + point.x));
          ring.setAttribute('cy', String(origin.y + point.y));
          ring.setAttribute(
            'r',
            String(
              cue.action === 'hold' || cue.action === 'drag'
                ? 12
                : 6 +
                    30 *
                      Math.max(0, Math.min(1, age / scene.timing.clickWaveMs)),
            ),
          );
          const path = group.querySelector<SVGPathElement>('path');
          if (path)
            path.setAttribute(
              'd',
              cue.points
                .filter((p) => p.timeMs <= t)
                .map(
                  (p, i) =>
                    `${i ? 'L' : 'M'} ${origin.x + p.x} ${origin.y + p.y}`,
                )
                .join(' '),
            );
        }
      }
      const spark = group.querySelector<SVGPolylineElement>(
        '.sparkline polyline',
      );
      if (spark) {
        const samples = cue.samples.filter(
          (s) =>
            sourceMs !== null && s.timeMs <= sourceMs && s.value !== undefined,
        );
        const values = samples.map((s) => s.value ?? 0);
        const min = Math.min(0, ...values),
          max = Math.max(1, ...values);
        spark.setAttribute(
          'points',
          samples
            .slice(-60)
            .map(
              (s, i, a) =>
                `${4 + (i / Math.max(1, a.length - 1)) * 296},${52 - (((s.value ?? 0) - min) / (max - min)) * 44}`,
            )
            .join(' '),
        );
      }
      const value = group.querySelector<HTMLElement>('.value');
      if (value)
        value.textContent =
          sourceMs === null
            ? 'No source time'
            : (cue.samples.filter((s) => s.timeMs <= sourceMs).at(-1)?.text ??
              'No observation yet');
    }
    pending = (async () => {
      if (frame && image.getAttribute('src') !== frame.asset) {
        image.src = frame.asset;
        await image.decode();
      }
      for (const canvas of Array.from(
        document.querySelectorAll<HTMLCanvasElement>('canvas[data-magnifier]'),
      )) {
        const cue = required(
          scene.cues.find((c) => c.id === canvas.dataset.magnifier),
        );
        if (!cue.target) continue;
        const ctx = required(canvas.getContext('2d'));
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const factor = cue.magnification ?? 2;
        const {
          x: sx,
          y: sy,
          width: sw,
          height: sh,
        } = magnifierRegion(
          cue.target,
          scene.viewport,
          factor,
          scene.style.cardWidth - scene.style.cardPadding * 2 - 5,
        );
        const scaleX = image.naturalWidth / scene.viewport.width,
          scaleY = image.naturalHeight / scene.viewport.height;
        ctx.drawImage(
          image,
          sx * scaleX,
          sy * scaleY,
          sw * scaleX,
          sh * scaleY,
          0,
          0,
          sw * factor,
          sh * factor,
        );
      }
    })();
  };
  root.__hf = { duration: mapping.length / scene.output.fps, seek };
  root.__hfWaitForSeekCompletion = () => pending;
  seek(0);
}

const escapeJson = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', '\\u003c');
async function fontCss() {
  const fonts = [
    ['Source Sans 3', 'source-sans-3', 400],
    ['Source Sans 3', 'source-sans-3', 600],
    ['Source Code Pro', 'source-code-pro', 400],
  ] as const;
  const receipts = [];
  let css = '';
  for (const [family, name, weight] of fonts) {
    const bytes = await readFile(
      require.resolve(
        `@fontsource/${name}/files/${name}-latin-${weight}-normal.woff2`,
      ),
    );
    receipts.push({ family, weight, sha256: digest(bytes) });
    css += `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`;
  }
  return { css, receipts };
}

function sceneMarkup(scene: ScenePlan) {
  const e = React.createElement;
  const svg = (...children: React.ReactNode[]) =>
    e(
      'svg',
      {
        width: scene.output.width,
        height: scene.output.height,
        style: { position: 'absolute', inset: 0, overflow: 'visible' },
      },
      ...children,
    );
  const markers: { x: number; y: number; start: number; end: number }[] = [];
  const accents: { color: string; start: number; end: number }[] = [];
  const groups = scene.cues
    .slice()
    .sort((a, b) => a.layer - b.layer)
    .map((c) => {
      let accent =
        c.severity === 'critical'
          ? scene.style.criticalAccent
          : c.kind === 'magnifier'
            ? '#64d6c3'
            : c.kind === 'alignment'
              ? '#c2a5f5'
              : c.kind === 'data-panel'
                ? '#91b8c8'
                : '#83baff';
      if (c.severity !== 'critical' && (c.target || c.kind === 'data-panel')) {
        const palette = [
          accent,
          '#64d6c3',
          '#c2a5f5',
          '#83baff',
          '#e9a5c7',
          '#b9cd80',
        ];
        accent =
          palette.find(
            (color) =>
              !accents.some(
                (a) =>
                  a.color === color && c.startMs < a.end && a.start < c.endMs,
              ),
          ) ?? accent;
        accents.push({ color: accent, start: c.startMs, end: c.endMs });
      }
      const region =
        c.kind === 'magnifier' && c.target
          ? magnifierRegion(
              c.target,
              scene.viewport,
              c.magnification ?? 2,
              scene.style.cardWidth - scene.style.cardPadding * 2 - 5,
            )
          : c.target;
      const target = region
        ? {
            x: region.x + scene.sourceOrigin.x,
            y: region.y + scene.sourceOrigin.y,
            width: region.width,
            height: region.height,
          }
        : undefined;
      const strokes: React.ReactNode[] = [];
      if (target) {
        if (c.kind !== 'alignment')
          strokes.push(
            e('rect', {
              ...target,
              x: target.x - 4,
              y: target.y - 4,
              width: target.width + 8,
              height: target.height + 8,
              clipPath: 'url(#source-clip)',
              rx: 6,
              fill: 'none',
              stroke: accent,
              strokeWidth: 1.5,
              strokeDasharray: c.dotted ? '2 4' : undefined,
            }),
          );
        strokes.push(
          e('path', {
            className: 'leader',
            fill: 'none',
            stroke: accent,
            strokeWidth: 1.25,
          }),
        );
      }
      let detail = c.detail;
      if (c.kind === 'alignment' && c.reference && target && c.target) {
        const axis = c.axis ?? 'x';
        const delta = c.target[axis] - c.reference[axis];
        detail = `Δ${axis} ${delta > 0 ? '+' : ''}${delta.toFixed(1)} CSS px`;
        const r = c.reference;
        const bx = scene.sourceOrigin.x + r.x,
          by = scene.sourceOrigin.y + c.target.y - 12;
        const ax = scene.sourceOrigin.x + c.target.x,
          ay = scene.sourceOrigin.y + r.y;
        strokes.push(
          e('path', {
            d:
              axis === 'x'
                ? `M ${bx} ${by - 4} V ${by + 4} M ${bx} ${by} H ${ax} M ${ax} ${by - 4} V ${by + 4}`
                : `M ${ax - 4} ${ay} H ${ax + 4} M ${ax} ${ay} V ${target.y} M ${ax - 4} ${target.y} H ${ax + 4}`,
            fill: 'none',
            stroke: accent,
            strokeWidth: 1 / scene.outputScale,
            clipPath: 'url(#source-clip)',
          }),
        );
        strokes.push(
          axis === 'x'
            ? e('line', {
                x1: Math.min(r.x, c.target.x) + scene.sourceOrigin.x,
                x2: Math.min(r.x, c.target.x) + scene.sourceOrigin.x,
                y1: scene.sourceOrigin.y + Math.min(r.y, c.target.y) - 12,
                y2:
                  scene.sourceOrigin.y +
                  Math.max(r.y + r.height, c.target.y + c.target.height) +
                  12,
                stroke: accent,
                strokeWidth: 1 / scene.outputScale,
                clipPath: 'url(#source-clip)',
              })
            : e('line', {
                y1: Math.min(r.y, c.target.y) + scene.sourceOrigin.y,
                y2: Math.min(r.y, c.target.y) + scene.sourceOrigin.y,
                x1: scene.sourceOrigin.x + Math.min(r.x, c.target.x) - 12,
                x2:
                  scene.sourceOrigin.x +
                  Math.max(r.x + r.width, c.target.x + c.target.width) +
                  12,
                stroke: accent,
                strokeWidth: 1 / scene.outputScale,
                clipPath: 'url(#source-clip)',
              }),
        );
      }
      if (c.kind === 'marker' && c.points[0]) {
        const p = c.points[0],
          x = p.x + scene.sourceOrigin.x,
          y = p.y + scene.sourceOrigin.y;
        const candidates = [
          [28, -30],
          [-32, -30],
          [48, 0],
          [-48, 0],
          [28, 36],
          [-32, 36],
          [64, -48],
          [-64, -48],
        ];
        const position = candidates
          .map(([dx = 0, dy = 0]) => ({ x: x + dx, y: y + dy }))
          .find(
            (p) =>
              p.x > scene.sourceOrigin.x + 20 &&
              p.x < scene.sourceOrigin.x + scene.viewport.width - 20 &&
              p.y > scene.sourceOrigin.y + 20 &&
              p.y < scene.sourceOrigin.y + scene.viewport.height - 20 &&
              !markers.some(
                (m) =>
                  c.startMs < m.end &&
                  m.start < c.endMs &&
                  Math.hypot(m.x - p.x, m.y - p.y) < 38,
              ) &&
              !scene.cues.some(
                (t) =>
                  t.target &&
                  t.startMs < c.endMs &&
                  c.startMs < t.endMs &&
                  p.x + 18 > t.target.x + scene.sourceOrigin.x &&
                  p.x - 18 <
                    t.target.x + scene.sourceOrigin.x + t.target.width &&
                  p.y + 18 > t.target.y + scene.sourceOrigin.y &&
                  p.y - 18 <
                    t.target.y + scene.sourceOrigin.y + t.target.height,
              ),
          );
        if (!position)
          throw new Error(
            `No protected-region-safe marker placement for ${c.id}`,
          );
        const { x: mx, y: my } = position;
        markers.push({ ...position, start: c.startMs, end: c.endMs });
        return e(
          'div',
          {
            'data-cue': c.id,
            key: c.id,
            'data-kind': c.kind,
            style: { display: 'contents' },
          },
          svg(
            e('path', {
              d: `M ${mx - 5} ${my} L ${x} ${y} L ${mx + 5} ${my}`,
              fill: '#b7d9ef',
            }),
            e('circle', {
              cx: mx,
              cy: my,
              r: 15,
              fill: '#b7d9ef',
              stroke: '#142334',
              strokeWidth: 2,
            }),
            e(
              'text',
              {
                x: mx,
                y: my + 6,
                textAnchor: 'middle',
                fill: '#142334',
                fontSize: 17,
                fontWeight: 600,
              },
              String(c.step),
            ),
          ),
          e(
            'section',
            {
              className: 'card marker-text',
              style: { borderColor: '#b7d9ef' },
            },
            e('div', { className: 'eyebrow' }, 'REPRODUCTION'),
            e(
              'div',
              { className: 'heading' },
              e('span', { className: 'number' }, c.step),
              e('span', null, c.title),
            ),
            c.detail ? e('div', { className: 'detail' }, c.detail) : null,
          ),
        );
      }
      if (c.kind === 'pointer')
        return e(
          'div',
          {
            'data-cue': c.id,
            key: c.id,
            'data-kind': c.kind,
            style: { display: 'contents' },
          },
          svg(
            e('path', {
              fill: 'none',
              stroke: scene.style.cursorColor,
              strokeWidth: 2,
            }),
            e(
              'text',
              {
                className: 'action-glyph',
                fontSize: 12,
                fontWeight: 600,
                fill: '#1c2734',
                stroke: '#fff',
                strokeWidth: 3,
                paintOrder: 'stroke',
              },
              c.action === 'click'
                ? ''
                : c.action === 'double-click'
                  ? '×2'
                  : c.action === 'right-click'
                    ? 'R'
                    : c.action === 'hold'
                      ? 'HOLD'
                      : c.action === 'cancel'
                        ? 'CANCEL'
                        : 'DRAG',
            ),
            e('circle', {
              r: 8,
              fill: 'none',
              stroke:
                c.action === 'right-click'
                  ? '#d5a2e9'
                  : scene.style.cursorColor,
              strokeWidth: 2.5,
            }),
          ),
        );
      const cardStyle =
        c.kind === 'title'
          ? {
              left: scene.style.outerInset,
              top: 18,
              width: scene.output.width - scene.style.outerInset * 2,
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
              padding: '0 0 4px',
            }
          : c.kind === 'outcome'
            ? {
                left:
                  scene.sourceOrigin.x +
                  scene.viewport.width +
                  scene.style.gutterGap,
                top: 96,
                width: scene.style.cardWidth,
              }
            : {};
      return e(
        'div',
        {
          'data-cue': c.id,
          key: c.id,
          'data-kind': c.kind,
          style: { display: 'contents' },
        },
        svg(...strokes),
        e(
          'section',
          {
            className: `card ${c.kind} ${c.severity}`,
            style: { borderColor: accent, ...cardStyle },
          },
          e(
            'div',
            { className: 'eyebrow' },
            c.severity === 'critical'
              ? 'BUG DETAIL'
              : c.kind === 'app-version'
                ? 'APPLICATION'
                : c.kind === 'title'
                  ? c.detail
                  : c.kind === 'step'
                    ? 'REPRODUCTION'
                    : c.kind === 'outcome'
                      ? 'VERIFIED OUTCOME'
                      : 'EVIDENCE',
          ),
          e(
            'div',
            { className: 'heading' },
            c.step ? e('span', { className: 'number' }, c.step) : null,
            e('span', null, c.title),
          ),
          detail && c.kind !== 'title'
            ? e('div', { className: 'detail' }, detail)
            : null,
          c.expected
            ? e(
                'div',
                { className: 'expectation' },
                e('b', null, 'Expected'),
                e('div', null, c.expected),
              )
            : null,
          c.observed
            ? e(
                'div',
                { className: 'observation' },
                e('b', null, 'Observed'),
                e('div', null, c.observed),
              )
            : null,
          c.format === 'sparkline'
            ? e(
                'svg',
                { className: 'sparkline', viewBox: '0 0 304 56' },
                e('polyline', {
                  fill: 'none',
                  stroke: '#77d6c3',
                  strokeWidth: 2,
                }),
              )
            : null,
          c.kind === 'data-panel'
            ? e('div', { className: 'value' }, 'No observation yet')
            : null,
          c.kind === 'magnifier'
            ? e(
                'div',
                { className: 'magnifier-viewport' },
                e('canvas', {
                  'data-magnifier': c.id,
                  width:
                    scene.style.cardWidth - scene.style.cardPadding * 2 - 5,
                  height: 176,
                }),
                e(
                  'span',
                  { className: 'zoom' },
                  `${c.magnification}× · source pixels`,
                ),
              )
            : null,
        ),
      );
    });
  return renderToStaticMarkup(
    e(
      'main',
      null,
      e('img', {
        id: 'source',
        style: {
          position: 'absolute',
          left: scene.sourceOrigin.x,
          top: scene.sourceOrigin.y,
          width: scene.viewport.width,
          height: scene.viewport.height,
        },
      }),
      e(
        'svg',
        { width: 0, height: 0, style: { position: 'absolute' } },
        e(
          'defs',
          null,
          e(
            'clipPath',
            { id: 'source-clip' },
            e('rect', {
              x: scene.sourceOrigin.x,
              y: scene.sourceOrigin.y,
              width: scene.viewport.width,
              height: scene.viewport.height,
            }),
          ),
        ),
      ),
      ...groups,
      e('canvas', {
        id: 'cursor-layer',
        width: scene.output.width * scene.outputScale,
        height: scene.output.height * scene.outputScale,
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          width: scene.output.width,
          height: scene.output.height,
          zIndex: 56,
          pointerEvents: 'none',
        },
      }),
      e('div', { id: 'speed' }),
      e('div', { id: 'clock' }),
    ),
  );
}

export async function renderSceneInProcess(input: {
  scene: ScenePlan;
  sources: SceneSourceFrame[];
  outDir: string;
  signal?: AbortSignal;
}) {
  const scene = parseScenePlan(input.scene);
  await mkdir(join(input.outDir, 'frames'), { recursive: true });
  const duration = scene.segments.reduce((n, s) => n + s.outDurationMs, 0);
  const count = Math.ceil((duration * scene.output.fps) / 1000);
  const frames = Array.from({ length: count }, (_, i) => {
    const position = selectSceneFrame(
      scene,
      input.sources,
      Math.min(duration - 0.001, (i * 1000) / scene.output.fps),
    );
    if (!position)
      throw new Error(
        'Insert scenes require an explicit source-free composition',
      );
    return {
      frame: i,
      outputMs: (i * 1000) / scene.output.fps,
      sourceMs: position.sourceMs,
      sourceFrameId: position.source.id,
      sourceSha256: position.source.originalSha256 ?? position.source.sha256,
      sanitizedSha256: position.source.sha256,
      capturedSourceMs: position.source.timeMs,
      pageId: position.source.pageId,
      segmentId: position.segmentId,
      asset: `assets/${position.source.sha256}.png`,
      label:
        scene.segments.find((s) => s.id === position.segmentId)?.label ??
        (scene.segments.find((s) => s.id === position.segmentId)?.kind ===
        'hold'
          ? 'Held frame · markers show recorded click locations'
          : ''),
    };
  });
  const assets = new Map<string, Buffer>();
  for (const source of input.sources) {
    const bytes = await readFile(source.path);
    if (digest(bytes) !== source.sha256)
      throw new Error(`Corrupt sanitized source: ${source.id}`);
    assets.set(`/assets/${source.sha256}.png`, bytes);
  }
  const fonts = await fontCss();
  const style = scene.style;
  const css = `${fonts.css}*{box-sizing:border-box}[data-cue]>*{will-change:opacity}[data-cue]>svg{z-index:30}[data-kind=marker]>svg,[data-kind=pointer]>svg{z-index:55}.card{z-index:50}.card.title,.card.app-version{z-index:60}.app-version .detail{white-space:pre-wrap;font-family:'Source Code Pro';font-size:${style.dataFontSize}px}.critical{border-color:${style.criticalAccent}!important;border-left:4px solid ${style.criticalAccent}!important;background:${style.criticalBackground}!important}.critical .eyebrow{color:#ffc994}.expectation,.observation{font-size:${style.bodyFontSize}px;line-height:1.35;margin-top:10px}.expectation b,.observation b{font-size:11px;letter-spacing:1px;text-transform:uppercase;display:block;color:#b6c5d2;margin-bottom:3px}.observation{color:#ffd3a6}.sparkline{display:block;width:100%;height:56px;margin-top:12px}html,body{margin:0;width:${scene.output.width}px;height:${scene.output.height}px;overflow:hidden;background:${style.background};color:${style.foreground};font:${style.bodyFontSize}px 'Source Sans 3'}main{position:relative;width:${scene.output.width}px;height:${scene.output.height}px;background:${style.background}}#source{box-shadow:0 0 0 1px #344050}.card{position:absolute;width:${style.cardWidth}px;padding:${style.cardPadding}px;border:1px solid #3b4654;border-radius:${style.cardRadius}px;background:${style.cardBackground};box-shadow:0 4px 12px #0004;overflow-wrap:anywhere}.eyebrow{font-size:11px;font-weight:600;letter-spacing:1.6px;color:#98b0c4;margin-bottom:6px}.heading{display:flex;align-items:flex-start;gap:10px;font-size:${style.headingFontSize}px;font-weight:600;line-height:1.25}.title .heading{font-size:${style.titleFontSize}px}.number{flex-shrink:0;display:grid;place-items:center;border-radius:50%;width:30px;height:30px;background:#b7d9ef;color:#101721;font-size:17px}.detail{margin-top:10px;color:#c5d4df;line-height:${style.lineHeight}}.value{font:${style.dataFontSize}px/1.5 'Source Code Pro';margin-top:12px;white-space:pre-wrap;min-height:88px}.magnifier-viewport{position:relative;margin-top:12px;box-shadow:0 3px 8px #0007;border-radius:4px;overflow:hidden;width:${style.cardWidth - style.cardPadding * 2 - 5}px;height:176px}.zoom{position:absolute;right:6px;bottom:6px;background:#101721;padding:3px 6px;font-size:12px;border-radius:4px}#speed,#clock{position:absolute;bottom:14px;font:12px 'Source Code Pro';color:#aac0d0}#speed{left:24px;color:#f0c888}#clock{right:24px}`;
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>${css}</style>${sceneMarkup(scene)}<script>const routeLeader=${routeLeader.toString()};const magnifierRegion=${magnifierRegion.toString()};(${sceneRuntime.toString()})(${escapeJson(scene)},${escapeJson(frames)});</script>`;
  await writeFile(join(input.outDir, 'composition.html'), html);
  await writeFile(
    join(input.outDir, 'scene.json'),
    JSON.stringify(scene, null, 2),
  );
  await writeFile(
    join(input.outDir, 'frame-map.json'),
    JSON.stringify(frames, null, 2),
  );
  const rendered = await captureComposition({
    html,
    assets,
    width: scene.output.width,
    height: scene.output.height,
    scale: scene.outputScale,
    encoding: scene.encoding,
    ...(scene.actionAudio ? { audio: actionWave(scene) } : {}),
    count,
    duration,
    outDir: input.outDir,
    metadata: {
      fonts: fonts.receipts,
      sceneSha256: digest(JSON.stringify(scene)),
      sourceFrameCount: input.sources.length,
    },
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return { ...rendered, frames };
}

/** Shared engine boundary for single views and comparison compositions. */
export async function captureComposition<
  M extends Record<string, unknown>,
>(input: {
  html: string;
  assets: Map<string, Buffer>;
  width: number;
  height: number;
  scale?: number;
  encoding?: ScenePlan['encoding'];
  count: number;
  duration: number;
  outDir: string;
  metadata: M;
  audio?: Buffer;
  signal?: AbortSignal;
}) {
  const { html, assets, count, duration } = input;
  if (
    count > 18000 ||
    [...assets.values()].reduce((sum, b) => sum + b.byteLength, 0) >
      256 * 1024 * 1024
  )
    throw new Error(
      'Scene exceeds the slice budget (10 minutes or 256 MiB of assets); split it into shorter beats',
    );
  const started = performance.now();
  await mkdir(join(input.outDir, 'frames'), { recursive: true });
  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
      return;
    }
    const asset = assets.get(req.url ?? '');
    if (!asset) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      req.url?.endsWith('.html') ? 'text/html' : 'image/png',
    );
    res.end(asset);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No compositor address');
  let session: Awaited<ReturnType<typeof createCaptureSession>> | undefined;
  try {
    input.signal?.throwIfAborted();
    session = await createCaptureSession(
      `http://127.0.0.1:${address.port}`,
      join(input.outDir, 'frames'),
      {
        width: input.width,
        height: input.height,
        fps: { num: 30, den: 1 },
        format: 'png',
        deviceScaleFactor: input.scale ?? 1,
      },
      null,
      {
        chromePath: await headlessShellPath(chromium.executablePath()),
        forceScreenshot: true,
        disableGpu: true,
        browserGpuMode: 'software',
        enableBrowserPool: false,
        staticFrameDedup: false,
        useDrawElement: false,
      },
    );
    await initializeSession(session);
    await session.page.evaluate(() => document.fonts.ready);
    const layout = await session.page.evaluate(
      'window.__reproLayout?.() ?? []',
    );
    await writeFile(
      join(input.outDir, 'layout.json'),
      JSON.stringify(layout, null, 2),
    );
    for (let i = 0; i < count; i++) {
      input.signal?.throwIfAborted();
      await captureFrame(session, i, i / 30);
      await session.page.evaluate('window.__reproValidate?.()');
    }
    let seekSeed = 20260928;
    const seeks = [
      count - 1,
      0,
      Math.floor(count / 2),
      ...Array.from({ length: 8 }, () => {
        seekSeed = (Math.imul(seekSeed, 1664525) + 1013904223) >>> 0;
        return seekSeed % count;
      }),
    ];
    for (const index of seeks) {
      const path = join(
        input.outDir,
        'frames',
        `frame_${String(index).padStart(6, '0')}.png`,
      );
      const expectedBytes = await readFile(path);
      const expected = digest(expectedBytes);
      await captureFrame(session, index, index / 30);
      if (digest(await readFile(path)) !== expected) {
        await writeFile(
          join(input.outDir, `seek-expected-${index}.png`),
          expectedBytes,
        );
        await writeFile(
          join(input.outDir, `seek-actual-${index}.png`),
          await readFile(path),
        );
        throw new Error(`Non-deterministic random seek at frame ${index}`);
      }
    }
    if (session.warnings.length)
      throw new Error(
        `Compositor readiness warnings: ${JSON.stringify(session.warnings)}`,
      );
    const receipt = {
      schemaVersion: '1.0.0',
      renderer: 'hyperframes',
      engineVersion: '0.8.87',
      compositionSha256: digest(input.html),
      encoding: {
        profile: 'h264-high',
        pixelFormat: 'yuv420p',
        fps: 30,
        actionAudio: Boolean(input.audio),
        crf: input.encoding?.crf ?? 18,
        preset: input.encoding?.preset ?? 'veryfast',
      },
      browser: await session.browser.version(),
      frameCount: count,
      durationMs: duration,
      renderMs: performance.now() - started,
      perf: getCapturePerfSummary(session),
      memory: {
        workerPeakRssKiB: process.resourceUsage().maxRSS,
        chrome: session.chromeMemory?.stats() ?? { samples: 0 },
      },
      ...input.metadata,
      randomSeekPassed: true,
      randomSeekSeed: 20260928,
      randomSeekIndices: seeks,
      layoutFramesChecked: count,
    };
    await writeFile(
      join(input.outDir, 'render-receipt.json'),
      JSON.stringify(receipt, null, 2),
    );
    const outputPath = join(input.outDir, 'proof.mp4');
    const audioPath = join(input.outDir, 'action-feedback.wav');
    if (input.audio) await writeFile(audioPath, input.audio);
    await runProcess(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-framerate',
        '30',
        '-i',
        join(input.outDir, 'frames', 'frame_%06d.png'),
        ...(input.audio
          ? ['-i', audioPath, '-c:a', 'aac', '-b:a', '96k', '-shortest']
          : []),
        ...h264Profile.map((value, index) =>
          h264Profile[index - 1] === '-crf'
            ? String(input.encoding?.crf ?? 18)
            : h264Profile[index - 1] === '-preset'
              ? (input.encoding?.preset ?? 'veryfast')
              : value,
        ),
        outputPath,
      ],
      input.signal ? { signal: input.signal } : {},
    );
    return { outputPath, receipt };
  } finally {
    if (session) await closeCaptureSession(session);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
}

/** Isolate engine stdout and browser processes; CLI output remains a single JSON value. */
export async function renderScene(
  input: Parameters<typeof renderSceneInProcess>[0],
): Promise<Awaited<ReturnType<typeof renderSceneInProcess>>> {
  await mkdir(input.outDir, { recursive: true });
  const request = join(input.outDir, 'render-request.json');
  await writeFile(
    request,
    JSON.stringify({
      scene: input.scene,
      sources: input.sources,
      outDir: input.outDir,
    }),
  );
  await runSceneWorker(request, input.signal);
  return JSON.parse(
    await readFile(join(input.outDir, 'render-result.json'), 'utf8'),
  ) as Awaited<ReturnType<typeof renderSceneInProcess>>;
}
