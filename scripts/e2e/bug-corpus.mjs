import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
const exec = promisify(execFile),
  root = resolve('.repro/bug-corpus');
await mkdir(root, { recursive: true });
async function cli(...args) {
  try {
    const r = await exec(
      process.execPath,
      [resolve('packages/cli/dist/bin.js'), ...args],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return args[0] === 'validate-config' ? {} : JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`${args.join(' ')}\n${e.stdout}\n${e.stderr}`);
  }
}
const cases = [
  [
    'gestures',
    'Pointer vocabulary and retained step callouts',
    900,
    720,
    'Dragging moves the item to position 2.',
    'Click, double-click, right-click, hold and drag are observed; the item never leaves position 1.',
    'Interaction coverage',
  ],
  [
    'overflow',
    'Metric suffix overflows its mobile card',
    393,
    720,
    'Keep 100.00% within the second metric card.',
    'The suffix extends beyond its allotted cell; inspect the right edge.',
    'DASH2R-949 / 302',
  ],
  [
    'clipping',
    'Final characters disappear in a short slot',
    1024,
    640,
    'Show the full event title and date.',
    'A fixed-height, non-wrapping slot hides the final characters.',
    'DASH2R-495 / 777 / 1158',
  ],
  [
    'overlap',
    'Description overlaps its own label',
    1024,
    720,
    'Keep the Description label baseline clear at 150% zoom.',
    'Absolute positioning places the value on top of its label.',
    'DASH2R-716 / 923',
  ],
  [
    'alignment',
    'Controls drift after opening event detail',
    1024,
    720,
    'Both segmented controls share the same left edge.',
    'The event-detail control moves 12 CSS pixels to the left.',
    'DASH2R-664',
  ],
  [
    'sticky',
    'Rows leak above a sticky table header',
    900,
    720,
    'The header touches the scrollport top without a gap.',
    'A two-pixel inset exposes moving rows above the header.',
    'DASH2R-794 / 607',
  ],
  [
    'footer',
    'Fixed controls cover the final table row',
    393,
    720,
    'The final row remains fully visible above fixed controls.',
    'The footer and floating action button cover content at the end.',
    'DASH2R-621 / 615 / 739',
  ],
  [
    'chrome',
    'Wizard search scrolls beneath the app bar',
    393,
    720,
    'Keep the wizard search and title visible.',
    'The header block belongs to the scrolling list and slides under app chrome.',
    'DASH2R-950',
  ],
  [
    'scroll',
    'Returning to the dashboard retains an offset',
    393,
    720,
    'Dashboard opens at scroll position zero.',
    'The document scrolls instead of an inner list and retains its offset.',
    'DASH2R-986 / 1022',
  ],
  [
    'layers',
    'Settings opens underneath view controls',
    1100,
    720,
    'New settings controls appear above the existing sheet.',
    'Settings has z-index 2 while View controls has z-index 3; the tap is intercepted.',
    'DASH2R-835 / 418',
  ],
  [
    'dark',
    'Dark theme leaves a light success surface',
    393,
    720,
    'Use dark success surface rgb(22, 61, 42).',
    'Actual surface rgb(220, 252, 231) remains light while text becomes rgb(213, 245, 220).',
    'DASH2R-1027 / 990 / 925',
  ],
  [
    'flash',
    'Previous check title flashes during routing',
    900,
    720,
    'Show QFC Check throughout the route transition.',
    'DM Check remains painted for 180ms; the final still alone cannot reveal this.',
    'DASH2R-1055 / 1030 / 1136',
  ],
  [
    'typing',
    'Input moves and Submit styling lags',
    393,
    720,
    'Keep the field stable and paint Submit as enabled while typing.',
    'The textarea shifts on input; Submit accepts the value before its disabled-looking paint updates.',
    'DASH2R-1025 / 1102',
  ],
  [
    'orientation',
    'Portrait-only disclosure does not respond',
    744,
    1000,
    'Only show a disclosure when the row can expand or collapse.',
    'An inert caret appears below 768px in portrait and disappears in landscape.',
    'DASH2R-1144 / 722 / 714',
  ],
  [
    'gallery',
    'Gallery swipe snaps back and search removes a column',
    1024,
    768,
    'A swipe changes the photo; empty search preserves the layout.',
    'The photo nudges then returns to image 1; searching zzzzz removes the detail column.',
    'DASH2R-1086 / 1085',
  ],
];
const results = JSON.parse(
  await readFile(join(root, 'results.json'), 'utf8').catch(() => '[]'),
);
for (const [kind, title, width, height, expected, detail, issues] of cases) {
  if (
    process.env.REPRO_CORPUS_KIND &&
    !process.env.REPRO_CORPUS_KIND.split(',').includes(kind)
  )
    continue;
  const role = process.env.REPRO_CORPUS_ROLE ?? 'before',
    name = `${kind}-${role}`;
  const config = {
    mode: 'repro',
    profile: ['sticky', 'flash', 'typing', 'gallery', 'scroll'].includes(kind)
      ? 'faithful'
      : 'controlled',
    surfaceCapture: 'page',
    features: { clickViz: true, redaction: true },
    viewport: { width, height, deviceScaleFactor: 1 },
    redaction: { strict: true, masks: [] },
  };
  const targetIds = [
    'target',
    ...(['overflow', 'alignment'].includes(kind) ? ['reference'] : []),
  ];
  const spec = {
    schemaVersion: '1.0.0',
    id: `corpus-${kind}`,
    title,
    variant: {
      id: role,
      role,
      label: role === 'before' ? 'Observed bug' : 'Corrected behavior',
    },
    claim: detail,
    expected,
    targets: targetIds.map((id) => ({
      id,
      description:
        id === 'target' ? 'Affected application element' : 'Reference element',
    })),
    steps: [
      { id: 'prepare', title: 'Load the application' },
      { id: 'open', title: 'Open the report' },
      {
        id: 'action',
        title:
          kind === 'dark'
            ? 'Toggle dark mode after the banner appears'
            : 'Perform the triggering interaction',
        trigger: true,
      },
      { id: 'finish', title: 'Inspect the resulting state' },
      { id: 'verify', title: 'Measure the outcome' },
    ],
    segments: [
      {
        id: 'interaction',
        title: 'Recorded interaction',
        step: 'action',
        required: true,
      },
    ],
    checkpoints: [
      ...(kind === 'gestures'
        ? [
            {
              id: 'sequence',
              step: 'finish',
              title: 'Three completed actions',
              targets: [],
              observations: ['screenshot'],
            },
          ]
        : []),
      ...(['flash', 'sticky', 'gallery'].includes(kind)
        ? [
            {
              id: 'during',
              step: 'action',
              title: 'Captured title transition',
              targets: [],
              observations: ['screenshot'],
              timing: 'transient',
              frame: {
                segment: 'interaction',
                event: {
                  kind:
                    kind === 'sticky'
                      ? 'probe.browser-state'
                      : 'probe.pointer:path',
                  match: {
                    phase:
                      kind === 'sticky'
                        ? 'scroll'
                        : kind === 'flash'
                          ? 'pointerup'
                          : 'pointerdown',
                  },
                  occurrence: kind === 'gallery' ? 1 : 0,
                },
                offsetMs: 40,
                maxOffsetMs: 67,
              },
            },
          ]
        : []),
      {
        id: 'result',
        step: 'verify',
        title: 'Measured result',
        targets: targetIds,
        observations: ['screenshot', 'bounds', 'assertion'],
      },
    ],
    outputs: ['png', 'mp4', 'review', 'package'],
    presentation: { readingHoldMs: 2500 },
    privacy: { strict: true, selectors: [], patterns: [] },
  };
  const treatments = {
    schemaVersion: '1.0.0',
    actionAudio: kind === 'gestures',
    steps: [
      { step: 'open', sequence: 'repro', text: 'Open the report.' },
      { step: 'action', sequence: 'repro' },
      {
        step: 'finish',
        sequence: 'repro',
        text: 'Inspect the final application state.',
      },
    ],
    treatments: [
      ...(kind === 'gestures'
        ? [
            {
              id: 'page-vitals',
              kind: 'data-panel',
              eventKind: 'browser.transfer',
              valuePath: 'cumulativeBytes',
              format: 'sparkline',
              unit: 'B',
              title: 'Page transfer',
              rationale:
                'Captured CDP cumulative transfer bytes; unavailable navigation timing is not fabricated',
            },
          ]
        : []),
      {
        id: 'bug-detail',
        kind: 'callout',
        checkpoint: 'result',
        target: 'target',
        title: role === 'before' ? 'Observed defect' : 'Corrected result',
        detail:
          role === 'after'
            ? 'Measured corrected behavior. ' + expected
            : detail,
        expected,
        severity: role === 'before' ? 'critical' : 'normal',
        rationale: `Explain measured evidence for ${issues}`,
      },
      ...(['overflow', 'clipping', 'overlap', 'sticky', 'dark'].includes(kind)
        ? [
            {
              id: 'detail-zoom',
              kind: 'magnifier',
              checkpoint: 'result',
              target: 'target',
              magnification: kind === 'sticky' ? 4 : 2,
              title: 'Inspect the affected pixels',
              rationale: 'Reveal the small or low-contrast defect',
            },
          ]
        : []),
      ...(kind === 'alignment'
        ? [
            {
              id: 'edge-gap',
              kind: 'alignment',
              checkpoint: 'result',
              target: 'target',
              reference: 'reference',
              axis: 'x',
              title: 'Measured left-edge difference',
              rationale: 'Show the CSS-pixel displacement',
            },
          ]
        : []),
      ...(['flash', 'sticky', 'gallery'].includes(kind)
        ? [
            {
              id: 'replay',
              kind: 'slowmo',
              segment: 'interaction',
              rate: 0.2,
              title: 'Recorded interaction replay',
              rationale: 'Expose only states present in the original capture',
            },
          ]
        : []),
      ...(['typing', 'flash', 'dark', 'gallery', 'gestures'].includes(kind)
        ? [
            {
              id: 'application-state',
              kind: 'data-panel',
              eventKind: 'scenario.state',
              eventMatch: { name: 'application' },
              valuePath: 'value',
              format: 'object',
              title: 'Application state',
              rationale:
                'Show explicit observed values synchronized to source time',
            },
          ]
        : []),
    ],
  };
  for (const [suffix, value] of [
    ['config', config],
    ['evidence', spec],
    ['treatment', treatments],
  ])
    await writeFile(
      join(root, `${name}.${suffix}.json`),
      JSON.stringify(value, null, 2),
    );
  await cli('validate-config', '--config', join(root, `${name}.config.json`));
  await cli('validate-evidence', join(root, `${name}.evidence.json`));
  await cli('validate-treatment', join(root, `${name}.treatment.json`));
  const captured = await cli(
    'run',
    'packages/playwright/examples/bug-corpus.spec.ts',
    '--playwright-config',
    'packages/playwright/examples/bug-corpus.config.ts',
    '--config',
    join(root, `${name}.config.json`),
    '--evidence',
    join(root, `${name}.evidence.json`),
    '--url',
    `http://127.0.0.1:3208/${kind}${role === 'after' ? '?fixed=1' : ''}`,
    '--out-dir',
    root,
  );
  if (!captured.ok) throw new Error(JSON.stringify(captured));
  const run = captured.runs[0].directory;
  const manifest = JSON.parse(await readFile(join(run, 'run.json'), 'utf8'));
  if (
    manifest.scenarioOutcome !==
    (role === 'before' ? 'bug-reproduced' : 'fix-verified')
  )
    throw new Error(
      `${name}: expected measured ${role} outcome, got ${manifest.scenarioOutcome}`,
    );
  if (kind === 'chrome') {
    // The fixture must leave some of the search field visible below the covering app bar.
    const events = (await readFile(join(run, 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const actual = events
      .filter((e) => e.kind === 'scenario.state' && e.payload.name === 'actual')
      .at(-1)?.payload.value;
    if (
      !actual ||
      !(
        actual.visibleHeight > 8 &&
        actual.visibleHeight < actual.searchHeight - 8
      )
    )
      throw new Error(
        `${name}: search field must be partially, not wholly, hidden: ${JSON.stringify(actual)}`,
      );
  }
  const rendered = await cli(
    'render',
    run,
    '--treatment',
    join(root, `${name}.treatment.json`),
  );
  await copyFile(rendered.outputPath, join(root, `${name}.mp4`));
  const item = { kind, role, title, issues, width, height, run, rendered };
  const old = results.findIndex((r) => r.kind === kind && r.role === role);
  if (old >= 0) results[old] = item;
  else results.push(item);
  await writeFile(join(root, 'results.json'), JSON.stringify(results, null, 2));
  await writeFile(
    join(root, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Repro — application defect corpus</title><style>body{margin:40px;background:#101721;color:#edf3f8;font:18px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:32px}article{background:#1c2734;padding:20px;border-radius:12px}video{width:100%;max-height:720px}small{color:#9fb9cb}h1{font-size:32px}</style><h1>Repro · standalone defect examples</h1><p>Captured application pixels, measured findings, synchronized source-time observations.</p><main>${results.map((r) => `<article><small>${r.issues} · ${r.width} × ${r.height} · ${r.role}</small><h2>${r.title}</h2><video controls preload="metadata" src="${r.kind}-${r.role}.mp4"></video></article>`).join('')}</main>`,
  );
  console.log(`${name}: ${rendered.outputPath}`);
}
