/** Synthetic diagnostics over captured ShopLite pixels. Never counted as measured bug proof. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const exec = promisify(execFile),
  root = resolve(process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix');
const cli = resolve('packages/cli/dist/bin.js');
const rows = [];
const groups = [
  {
    features: ['a11yOverlay', 'vitalsHud', 'steps', 'hitTargets'],
    reason:
      'Accessibility diagnostics alongside interaction and responsiveness context',
    events: [
      [
        'probe.axe.violation',
        {
          rule: 'ACCESSIBILITY',
          impact: 'critical',
          x: 500,
          y: 280,
          width: 100,
          height: 40,
        },
      ],
      ['probe.vital:CLS', { name: 'CLS', value: 0.12 }],
      [
        'probe.elementsFromPoint',
        { label: 'HITBOX', x: 500, y: 280, width: 100, height: 40 },
      ],
    ],
  },
  {
    features: ['consoleOverlay', 'freezeDetect', 'pauses', 'steps'],
    reason:
      'Separate console failure from an observed stall; pause is presentation-only',
    events: [
      ['console.error', { message: 'CONSOLE', level: 'error' }],
      ['editorial.freeze', { durationMs: 350 }],
      ['editorial.pause', { durationMs: 400 }],
    ],
  },
  {
    features: ['hiddenElements', 'stackingContexts', 'layoutShiftViz', 'zoom'],
    reason:
      'Layering and geometry diagnostics; magnifier is checked separately from measured displacement',
    events: [
      [
        'probe.aria-hidden',
        { label: 'HIDDEN', x: 500, y: 280, width: 100, height: 40 },
      ],
      [
        'editorial.stacking',
        { label: 'STACKING', x: 500, y: 280, width: 100, height: 40 },
      ],
      [
        'web-vitals.layout-shift',
        { score: 0.12, sources: [{ x: 500, y: 280, width: 100, height: 40 }] },
      ],
      ['editorial.zoom', { x: 500, y: 280, width: 100, height: 40 }],
    ],
  },
  {
    features: [
      'cursor',
      'clickViz',
      'keystrokes',
      'steps',
      'slowmo',
      'specCard',
    ],
    reason:
      'Instructional action sequence; retiming is labeled and not used as latency proof',
    events: [
      ['probe.pointer:path', { phase: 'pointermove', x: 510, y: 290 }],
      ['probe.pointer:path', { phase: 'pointermove', x: 530, y: 300 }],
      [
        'probe.pointer:path',
        { phase: 'pointerdown', button: 0, x: 530, y: 300 },
      ],
      ['keyboard.keydown', { key: 'Tab' }],
      ['editorial.slowmo', { factor: 2, durationMs: 200 }],
    ],
  },
];
const save = () =>
  writeFile(
    join(root, 'overlays.json'),
    JSON.stringify({ rows, generatedAt: new Date().toISOString() }, null, 2),
  );
const strategies = JSON.parse(
  await readFile(join(root, 'strategies.json'), 'utf8'),
).rows;
for (const [g, group] of groups.entries())
  for (const long of [false, true]) {
    const id = `MIX-${String(g * 2 + (long ? 2 : 1)).padStart(2, '0')}`;
    const row = {
      id,
      title: group.reason,
      features: [...group.features, 'redaction'],
      theme: long ? 'dark / long wide text' : 'light / short text',
      strategies: [],
      level: 'synthetic diagnostics + actual encoded pixels',
      status: 'running',
      checks: [],
      artifacts: [],
    };
    rows.push(row);
    await save();
    const folder = join(root, id);
    await mkdir(folder, { recursive: true });
    try {
      const source = strategies.find(
        (r) => r.id === (long ? 'STR-08' : 'STR-01'),
      ).runs[0];
      const manifest = JSON.parse(
        await readFile(join(source, 'run.json'), 'utf8'),
      );
      const sourceEvents = (
        await readFile(join(source, 'events.jsonl'), 'utf8')
      )
        .trim()
        .split('\n')
        .map(JSON.parse);
      const duration = Math.max(800, Math.floor(manifest.durationMs - 50));
      const inputs = [
        ['start', {}],
        [
          'step.chapter',
          {
            title: long
              ? 'STEPS ' + 'WWWW international inventory description '.repeat(8)
              : 'STEPS inspect action',
            stepId: 'inspect',
          },
        ],
        ...group.events.map(([kind, payload]) => [
          kind,
          {
            ...payload,
            ...(long
              ? {
                  label:
                    (payload.label ??
                      payload.message ??
                      payload.rule ??
                      'DETAIL') + ' WWWW international description '.repeat(8),
                  ...(payload.message
                    ? { message: 'CONSOLE ' + 'WWWW '.repeat(80) }
                    : {}),
                }
              : {}),
          },
        ]),
        ...sourceEvents
          .filter((e) => /mask|redaction/.test(e.kind))
          .map((e) => [e.kind, e.payload]),
        ['end', {}],
      ];
      const events = inputs.map(([kind, payload], i) => ({
        schemaVersion: 1,
        id: `${id}-${i}`,
        runId: id,
        pageId: 'page-1',
        kind,
        payload,
        seq: i + 1,
        t_mono:
          i === inputs.length - 1
            ? duration
            : i === 0
              ? 0
              : (manifest.observations.find(
                  (o) => o.checkpoint === 'context' && o.kind === 'screenshot',
                ).endMs ?? 800) +
                50 +
                i * 5,
        hash: 'a'.repeat(64),
      }));
      const config = {
        mode: 'repro',
        profile: 'controlled',
        surfaceCapture: 'page',
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        features: Object.fromEntries(
          [...group.features, 'redaction'].map((f) => [f, true]),
        ),
        metadata: {
          bugId: id,
          title: `${id} synthetic diagnostic stress`,
          expected: 'Readable, separated evidence',
          actual: 'Inspect every active diagnostic',
          annotationHints: [],
        },
        redaction: { strict: true, masks: [] },
      };
      if (group.features.includes('specCard'))
        events.splice(1, 0, {
          ...events[0],
          id: `${id}-env`,
          kind: 'capture.environment',
          payload: sourceEvents.find((e) => e.kind === 'capture.environment')
            .payload,
        });
      const configPath = join(folder, 'config.json'),
        eventsPath = join(folder, 'events.jsonl');
      await writeFile(configPath, JSON.stringify(config));
      await writeFile(
        eventsPath,
        events.map((e) => JSON.stringify(e)).join('\n'),
      );
      await exec(process.execPath, [
        cli,
        'validate-config',
        '--config',
        configPath,
      ]);
      const { stdout } = await exec(
        process.execPath,
        [
          cli,
          'annotate',
          '--config',
          configPath,
          '--events',
          eventsPath,
          '--video',
          join(source, 'capture.mp4'),
          '--out-dir',
          folder,
          '--output-name',
          'stress.mp4',
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      );
      const result = JSON.parse(stdout),
        plan = result.plan;
      row.artifacts.push(
        {
          label: 'Encoded MP4',
          path: result.render.videoPath ?? join(folder, 'stress.mp4'),
        },
        { label: 'Plan and full labels', path: result.planPath },
      );
      const plates = plan.annotations.filter(
        (a) =>
          ![
            'target-ring',
            'cursor-path',
            'click-ripple',
            'progress-rail',
          ].includes(a.component),
      );
      const overlaps = (a, b) =>
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      for (const a of plates)
        for (const b of plates) {
          if (a.id >= b.id) continue;
          const at = a.outTimeRange ?? a.timeRange,
            bt = b.outTimeRange ?? b.timeRange;
          if (at.start < bt.end && bt.start < at.end)
            assert.ok(
              !overlaps(a.bounds, b.bounds),
              `${a.id} overlaps ${b.id}`,
            );
        }
      row.checks.push('All simultaneous planned plates are disjoint');
      for (const flag of group.features) {
        if (flag === 'specCard')
          assert.ok(plan.timeline.beats.some((b) => b.id === 'slate'));
        else
          assert.ok(
            plan.annotations.some((a) => a.feature === flag),
            `No annotation for enabled ${flag}`,
          );
      }
      const main =
          plates.find((a) => a.feature === group.features[0]) ?? plates[0],
        range = main.outTimeRange ?? main.timeRange;
      const timestamp =
        (range.start + Math.min(400, (range.end - range.start) / 2)) / 1000;
      const image = join(folder, 'active.png');
      await exec('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-ss',
        String(timestamp),
        '-i',
        join(folder, 'stress.mp4'),
        '-frames:v',
        '1',
        image,
      ]);
      row.artifacts.push({
        label: `Active frame (${timestamp.toFixed(3)} s)`,
        path: image,
      });
      if (g === 2 || g === 3) {
        const { stdout: pixels } = await exec(
          'ffmpeg',
          [
            '-v',
            'error',
            '-i',
            image,
            '-f',
            'rawvideo',
            '-pix_fmt',
            'rgb24',
            'pipe:1',
          ],
          { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
        );
        const rgb = (x, y) => [
          ...pixels.subarray(
            (Math.floor(y) * 1280 + Math.floor(x)) * 3,
            (Math.floor(y) * 1280 + Math.floor(x)) * 3 + 3,
          ),
        ];
        if (g === 2) {
          const roi = plan.annotations.find(
            (a) => a.component === 'roi-magnifier',
          );
          const p = roi.bounds,
            src = roi.anchor.bbox;
          const a = rgb(p.x + p.width / 2, p.y + p.height / 2),
            b = rgb(src.x + src.w / 2, src.y + src.h / 2);
          assert.ok(
            a.every((v, i) => Math.abs(v - b[i]) < 25),
            'Magnifier must contain corresponding application pixels',
          );
          row.checks.push('Magnifier center agrees with source pixels');
        }
        if (g === 3) {
          const points = [
            [516, 293],
            [520, 295],
            [524, 297],
          ];
          assert.ok(
            points.every(([x, y]) => {
              const [r, g, b] = rgb(x, y);
              return b > r + 30 && b > g + 20;
            }),
            'Measured cursor segment missing from encoded pixels',
          );
          row.checks.push(
            'Measured pointer trail visible at three expected coordinates',
          );
        }
      }
      const words = [];
      for (const [index, a] of plates.entries()) {
        const r = a.outTimeRange ?? a.timeRange;
        if (timestamp * 1000 < r.start || timestamp * 1000 >= r.end) continue;
        const b = a.bounds,
          crop = join(folder, `plate-${index}.png`);
        await exec('ffmpeg', [
          '-v',
          'error',
          '-y',
          '-i',
          image,
          '-vf',
          `crop=${Math.floor(b.width)}:${Math.floor(b.height)}:${Math.floor(b.x)}:${Math.floor(b.y)},scale=iw*2:ih*2`,
          crop,
        ]);
        const { stdout } = await exec('tesseract', [
          crop,
          'stdout',
          '--psm',
          '6',
        ]);
        words.push(stdout);
      }
      const text = words.join(' ');
      const required = [
        ['ACCESSIBILITY', 'HITBOX', 'CLS', 'STEP'],
        ['CONSOLE', 'freeze', 'PAUSED', 'STEP'],
        ['HIDDEN', 'STACKING'],
        ['STEP', 'Typed'],
      ][g];
      for (const token of required)
        assert.ok(
          text.toLowerCase().includes(token.toLowerCase()),
          `Encoded active frame is missing readable ${token}: ${text}`,
        );
      row.checks.push(`Actual active-frame OCR: ${required.join(', ')}`);
      // Outcome is common to every stress composition; it must actually survive encoding.
      const end = join(folder, 'outcome.png');
      await exec('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-ss',
        String((plan.metadata.durationMs - 500) / 1000),
        '-i',
        join(folder, 'stress.mp4'),
        '-frames:v',
        '1',
        end,
      ]);
      row.artifacts.push({ label: 'Outcome frame', path: end });
      const outcomeBox = plan.annotations.find(
        (a) => a.component === 'outcome-pair',
      ).bounds;
      const outcomeCrop = join(folder, 'outcome-text.png');
      await exec('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-i',
        end,
        '-vf',
        `crop=${Math.floor(outcomeBox.width)}:${Math.floor(outcomeBox.height)}:${Math.floor(outcomeBox.x)}:${Math.floor(outcomeBox.y)},scale=iw*2:ih*2`,
        outcomeCrop,
      ]);
      const { stdout: outcome } = await exec('tesseract', [
        outcomeCrop,
        'stdout',
        '--psm',
        '6',
      ]);
      assert.match(outcome, /EXPECTED/i);
      assert.match(outcome, /ACTUAL/i);
      const { stdout: fullText } = await exec('tesseract', [
        image,
        'stdout',
        '--psm',
        '11',
      ]);
      assert.doesNotMatch(fullText, /review-canary/);
      row.checks.push(
        'Encoded frame decoded, privacy canary absent, expected/actual cards OCR-visible',
      );
      row.status = 'passed';
    } catch (e) {
      row.status = 'failed';
      row.error = [e.message, e.stdout, e.stderr].filter(Boolean).join('\n');
    }
    await save();
    console.log(`${id}: ${row.status}`);
  }
if (rows.some((r) => r.status !== 'passed')) process.exitCode = 1;
