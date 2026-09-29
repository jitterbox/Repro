import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { scenePlanSchema, type RunManifest } from '@jitterbox/repro-contracts';
import { parsePlan } from '@jitterbox/repro-contracts';
import {
  buildDevToolsReport,
  assertDiagnosticPolicy,
  sanitizeDiagnostic,
} from './devtools-export.js';
import { packageCommand } from './commands/package.js';

it('exports synchronized snapshots with coverage, omits raw data, and replaces stale diagnostics on opt-out', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-devtools-'));
  try {
    const events = [
      {
        id: 'e1',
        kind: 'browser.request',
        pageId: 'page',
        t_mono: 120,
        payload: {
          url: 'https://user:pass@example.test/api?token=secret#secret',
          method: 'GET',
        },
      },
      {
        id: 'e2',
        kind: 'scenario.state',
        pageId: 'page',
        t_mono: 130,
        payload: {
          timing: 'host-observation-window',
          uncertaintyMs: 2,
          value: {
            count: 3,
            password: 'private',
            access_token: 'private',
            email: 'qa@example.test',
            note: 'account-1234',
          },
        },
      },
      {
        id: 'e3',
        kind: 'browser.console',
        pageId: 'page',
        t_mono: 140,
        payload: {
          message: 'Bearer TOPSECRET repro-canary-secret-negative',
          headers: { Authorization: 'private' },
        },
      },
      {
        id: 'e4',
        kind: 'diagnostic.coverage',
        pageId: 'page',
        t_mono: 140,
        payload: {
          collector: 'webmcp',
          status: 'unsupported',
          reason: 'Unavailable',
        },
      },
      {
        id: 'e5',
        kind: 'probe.rrweb',
        pageId: 'page',
        t_mono: 150,
        payload: { html: 'unmasked DOM' },
      },
    ];
    await writeFile(
      join(directory, 'events.jsonl'),
      events.map((e) => JSON.stringify(e)).join('\n'),
    );
    const scene = scenePlanSchema.parse({
      schemaVersion: '1.0.0',
      renderer: 'hyperframes',
      viewport: { width: 1280, height: 720 },
      output: { width: 1680, height: 960, fps: 30 },
      sourceOrigin: { x: 24, y: 96 },
      cues: [],
      segments: [
        {
          id: 'play',
          kind: 'play',
          outStartMs: 0,
          outDurationMs: 100,
          sourceStartMs: 100,
          rate: 1,
          pageId: 'page',
        },
        {
          id: 'hold',
          kind: 'hold',
          outStartMs: 100,
          outDurationMs: 100,
          sourceStartMs: 150,
          rate: 0,
          pageId: 'page',
        },
        {
          id: 'replay',
          kind: 'play',
          outStartMs: 200,
          outDurationMs: 500,
          sourceStartMs: 100,
          rate: 0.2,
          pageId: 'page',
        },
      ],
    });
    await writeFile(join(directory, 'scene.json'), JSON.stringify(scene));
    const frames = [
      {
        frame: 0,
        outputMs: 0,
        sourceMs: 100,
        capturedSourceMs: 95,
        sourceFrameId: 'source-1',
        pageId: 'page',
        segmentId: 'play',
        asset: '/private/source.png',
      },
    ];
    await writeFile(join(directory, 'frames.json'), JSON.stringify(frames));
    const run = {
      id: 'run',
      durationMs: 200,
      variant: { id: 'before', role: 'before', label: 'Before' },
      environment: { recordingStartMs: 100 },
      observations: [],
      artifacts: [
        { kind: 'events', path: 'events.jsonl' },
        { kind: 'presentation-scene', path: 'scene.json' },
        { kind: 'presentation-frame-map', path: 'frames.json' },
      ],
    } as unknown as RunManifest;
    const plan = parsePlan({
      schemaVersion: 1,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      annotations: [],
      chapters: [],
      redactionRects: [],
      segments: [],
      metadata: { durationMs: 700, generatedAtEpoch: 0 },
      timeline: {
        schemaVersion: '1.0.0',
        fps: 30,
        beats: [
          {
            id: 'capture',
            kind: 'play',
            captureStartMs: 0,
            captureEndMs: 100,
            outDurationMs: 100,
          },
        ],
        timeMap: { kind: 'piecewise-linear', knots: [[0, 0]] },
        warnings: [],
      },
    });
    const report = await buildDevToolsReport({
      directory,
      run,
      plan,
      workItem: 'DASH2R-949',
      video: 'DASH2R-949_before_repro.mp4',
      durationMs: 700,
      patterns: ['account-\\d+'],
    });
    expect(report.events).toHaveLength(4);
    expect(report.events[0]?.data.url).toBe('https://example.test/api');
    expect(report.events[0]?.uncertaintyMs).toBeNull();
    expect(report.events[1]?.data.value).toEqual({
      count: 3,
      password: '[redacted]',
      access_token: '[redacted]',
      email: '[redacted]',
      note: '[redacted]',
    });
    expect(report.events[1]?.uncertaintyMs).toBe(2);
    expect(report.segments.map((s) => s.sourceStartMs)).toEqual([
      100, 150, 100,
    ]);
    expect(report.segments[2]?.rate).toBe(0.2);
    expect(report.frames[0]?.sourceFrameId).toBe('source-1');
    expect(JSON.stringify(report)).not.toMatch(
      /TOPSECRET|private|unmasked DOM|account-1234|qa@example/,
    );
    expect(report.coverage[0]?.status).toBe('unsupported');
    expect(report.omittedEventCount).toBe(1);
    const viewer = join(directory, 'viewer');
    await mkdir(viewer);
    await writeFile(join(viewer, 'index.html'), 'viewer');
    const outDir = join(directory, 'bundle');
    const bundled = await packageCommand({
      outDir,
      viewerDir: viewer,
      workItem: 'DASH2R-949',
      devtools: [{ fileName: 'DASH2R-949_before_devtools.json', report }],
    });
    expect(bundled.manifest.assets[0]?.href).toBe(
      'assets/DASH2R-949_before_devtools.json',
    );
    expect(
      JSON.parse(
        await readFile(
          join(outDir, 'assets/DASH2R-949_before_devtools.json'),
          'utf8',
        ),
      ),
    ).toEqual(report);
    await packageCommand({ outDir, viewerDir: viewer, devtools: [] });
    expect(await readdir(join(outDir, 'assets'))).toEqual([]);
    await expect(
      packageCommand({
        outDir,
        viewerDir: viewer,
        devtools: [{ fileName: '../escape.json', report }],
      }),
    ).rejects.toThrow('Unsafe');
    const event = report.events[0];
    if (!event) throw new Error('Missing event');
    await expect(
      packageCommand({
        outDir,
        viewerDir: viewer,
        devtools: [
          {
            fileName: 'bad.json',
            report: {
              ...report,
              events: [{ ...event, data: { headers: { Cookie: 'secret' } } }],
            },
          },
        ],
      }),
    ).rejects.toThrow('Restricted field');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('sanitizes nested keys and rejects unsafe reports supplied directly to packaging', () => {
  expect(
    sanitizeDiagnostic(
      { 'qa@example.test': 'fine', key: 'a', nested: [{ token: 'secret' }] },
      [],
    ),
  ).toEqual({
    '[redacted]': 'fine',
    key: '[redacted]',
    nested: [{ token: '[redacted]' }],
  });
  expect(() => {
    assertDiagnosticPolicy({ url: 'https://example.test/path?token=secret' });
  }).toThrow('Unsanitized');
});
