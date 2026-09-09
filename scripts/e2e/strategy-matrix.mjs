/** Actual browser outcomes for each supported discovery strategy, plus native rejection. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const exec = promisify(execFile);
const root = resolve(process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix');
await mkdir(root, { recursive: true });
const cli = resolve('packages/cli/dist/bin.js');
const examples = resolve('packages/playwright/examples');
const selected = process.env.REPRO_MATRIX_ONLY?.split(',');
const rows = selected
  ? JSON.parse(
      await readFile(join(root, 'strategies.json'), 'utf8'),
    ).rows.filter(
      (row) =>
        row.id !== 'STR-12' &&
        !row.strategies.some((kind) => selected.includes(kind)),
    )
  : [];
async function command(...args) {
  const { stdout } = await exec(process.execPath, [cli, ...args], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return args[0] === 'validate-config'
    ? { output: stdout }
    : JSON.parse(stdout);
}
const kinds = [
  'interaction',
  'geometry',
  'appearance',
  'transient',
  'console',
  'performance',
  'accessibility',
  'keyboard',
  'multipage',
  'privacy',
  'network',
  'text',
];
const save = () =>
  writeFile(
    join(root, 'strategies.json'),
    JSON.stringify(
      { schemaVersion: 1, generatedAt: new Date().toISOString(), rows },
      null,
      2,
    ),
  );
for (const [index, kind] of kinds.entries()) {
  const id =
    kind === 'text' ? 'TXT-01' : `STR-${String(index + 1).padStart(2, '0')}`;
  if (selected && !selected.includes(kind)) continue;
  const theme = index % 2 ? 'dark' : 'light';
  const row = {
    id,
    title: `${kind}: natural action and designated outcome`,
    strategies: [kind],
    features: ['steps', 'redaction'],
    theme,
    level: 'browser-outcome + rendered pixels',
    status: 'running',
    artifacts: [],
    checks: [],
  };
  rows.push(row);
  await save();
  try {
    const pair = [];
    for (const role of ['before', 'after']) {
      const folder = join(root, id, role);
      await mkdir(folder, { recursive: true });
      const multi = kind === 'multipage',
        appearance = kind === 'appearance';
      const targets = multi
        ? []
        : appearance
          ? ['affected']
          : ['action', 'affected'];
      const evidence = {
        schemaVersion: '1.0.0',
        id,
        title: `ShopLite ${kind} reproduction`,
        variant: {
          id: role,
          role,
          label: role === 'before' ? 'Before' : 'After',
        },
        claim: `The natural ${kind} scenario fails its designated condition before the fix and meets it afterward`,
        expected: `The ${kind} acceptance condition passes`,
        targets: [
          { id: 'action', description: 'Natural trigger' },
          { id: 'affected', description: 'Affected application result' },
        ],
        steps: [
          { id: 'prepare', title: 'Establish the ready state' },
          { id: 'trigger', title: `Perform the ${kind} action`, trigger: true },
          { id: 'verify', title: 'Verify the observed result' },
        ],
        segments: ['transient', 'performance'].includes(kind)
          ? [
              {
                id: 'critical',
                title: 'Action through completion',
                step: 'trigger',
              },
            ]
          : [],
        checkpoints: [
          {
            id: 'context',
            step: 'prepare',
            title: 'Context before the action',
            targets: ['action', 'affected'],
            observations: ['screenshot', 'bounds', 'assertion'],
            highlights: [],
          },
          ...(kind === 'transient'
            ? [
                {
                  id: 'critical-frame',
                  step: 'trigger',
                  title: 'Frame 100 ms after the trigger',
                  observations: ['screenshot'],
                  timing: 'transient',
                  frame: {
                    segment: 'critical',
                    event: {
                      kind: 'probe.pointer:path',
                      match: { phase: 'pointerdown' },
                    },
                    offsetMs: 100,
                    maxOffsetMs: 1000 / 15,
                  },
                },
              ]
            : []),
          {
            id: 'result',
            step: 'verify',
            title: 'Result of the natural action',
            targets,
            observations: [
              'screenshot',
              'assertion',
              ...(!multi && !appearance ? ['bounds'] : []),

              ...(appearance ? ['visibility'] : []),
              ...(kind === 'accessibility' ? ['accessibility'] : []),
              ...(kind === 'network' ? ['network'] : []),
            ],
            highlights:
              !multi && !appearance
                ? [{ target: 'affected', label: 'Observed application result' }]
                : [],
          },
        ],
        outputs: ['png', 'mp4', 'review'],
        privacy: {
          strict: true,
          selectors: ['[data-testid="lab-private"]'],
          patterns: [],
        },
      };
      const path = join(folder, 'evidence.json');
      await writeFile(path, JSON.stringify(evidence));
      const config = join(folder, 'config.json');
      await writeFile(
        config,
        JSON.stringify({
          mode: 'repro',
          profile: kind === 'geometry' ? 'controlled' : 'faithful',
          surfaceCapture: 'page',
          viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
          features: { steps: true, redaction: true },
          redaction: { strict: true, masks: [] },
        }),
      );
      await command('validate-config', '--config', config);
      await command('validate-evidence', path);
      const capture = await command(
        'run',
        join(examples, 'matrix.spec.ts'),
        '--playwright-config',
        join(examples, 'matrix.config.ts'),
        '--evidence',
        path,
        '--config',
        config,
        '--url',
        `http://127.0.0.1:5177/?lab=1&case=${kind}&fixture=${role === 'before' ? 'broken' : 'fixed'}&theme=${theme}&text=long`,
        '--out-dir',
        folder,
      );
      assert.equal(capture.ok, true, JSON.stringify(capture));
      const directory = capture.runs[0].directory;
      const manifest = JSON.parse(
        await readFile(join(directory, 'run.json'), 'utf8'),
      );
      assert.equal(
        manifest.scenarioOutcome,
        role === 'before' ? 'bug-reproduced' : 'fix-verified',
      );
      row.runs ??= [];
      row.runs.push(directory);
      if (kind === 'accessibility') {
        assert.ok(
          manifest.observations.some(
            (o) =>
              o.kind === 'accessibility' &&
              o.data?.engineMode === 'axe-in-page',
          ),
        );
        const capturedEvents = (
          await readFile(join(directory, 'events.jsonl'), 'utf8')
        )
          .trim()
          .split('\n')
          .map(JSON.parse);
        assert.equal(
          new Set(capturedEvents.map((e) => e.pageId).filter(Boolean)).size,
          1,
          'Accessibility must not create scratch popup evidence',
        );
      }
      await command('render', directory);
      const rendered = JSON.parse(
        await readFile(join(directory, 'run.json'), 'utf8'),
      );
      const image = rendered.artifacts.find(
        (a) =>
          a.kind === 'presentation-image' && a.path.endsWith('/result.png'),
      );
      const video = rendered.artifacts.find(
        (a) => a.kind === 'presentation-video',
      );
      const frame = join(directory, image.path);
      row.artifacts.push(
        { label: `${role} PNG`, path: frame },
        { label: `${role} MP4`, path: join(directory, video.path) },
      );
      const outcomeCrop = join(folder, 'outcome-ocr.png');
      await exec('ffmpeg', [
        '-v',
        'error',
        '-y',
        '-i',
        frame,
        '-vf',
        'crop=1232:60:24:548',
        outcomeCrop,
      ]);
      const { stdout: text } = await exec('tesseract', [
        outcomeCrop,
        'stdout',
        '--psm',
        '6',
      ]);
      assert.match(text, role === 'before' ? /Bug reproduced/ : /Fix verified/);
      const { stdout: fullText } = await exec('tesseract', [
        frame,
        'stdout',
        '--psm',
        '11',
      ]);
      assert.doesNotMatch(fullText, /review-canary/);
      if (kind === 'interaction')
        assert.ok(
          manifest.observations.some(
            (o) =>
              o.kind === 'hit-test' &&
              o.target === 'action' &&
              o.status === 'passed',
          ),
        );
      if (kind === 'transient') {
        const selected = await command(
          'frame',
          directory,
          '--checkpoint',
          'critical-frame',
        );
        assert.ok(Math.abs(selected.selectionOffsetMs ?? 0) <= 1000 / 15);
        row.checks.push(
          `${role}: event-linked frame selection within two frames`,
        );
      }
      pair.push(directory);

      row.checks.push(
        `${role}: designated outcome, rendered outcome text, masked fixture canary`,
      );
    }
    row.status = 'passed';
    row.runs = pair;
  } catch (error) {
    row.status = 'failed';
    row.error = [error.message, error.stdout, error.stderr]
      .filter(Boolean)
      .join('\n');
  }
  await save();
  console.log(`${id} ${kind}: ${row.status}`);
}
const native = {
  id: 'STR-12',
  title: 'Native UI: reject page-proof substitution',
  strategies: ['native'],
  level: 'public CLI negative control',
  status: 'running',
  artifacts: [],
  checks: [],
};
rows.push(native);
try {
  const result = await command(
    'discover',
    join(examples, 'discovery-bug.json'),
  );
  const assessment = {
    claim: 'Native dialog must be visible',
    expected: 'OS surface is captured',
    concerns: [
      {
        kind: 'native',
        rationale: 'Native UI is outside page content',
        sourceRefs: ['title'],
      },
    ],
    triggerStep: 2,
    targets: [{ id: 'native', description: 'Native dialog', role: 'affected' }],
  };
  const path = join(root, 'native-assessment.json');
  await writeFile(path, JSON.stringify(assessment));
  const actual = await command(
    'discover',
    join(examples, 'discovery-bug.json'),
    '--assessment',
    path,
  );
  assert.equal(actual.status, 'unsupported-surface');
  assert.equal(actual.evidenceDraft, null);
  assert.deepEqual(actual.passes, []);
  const report = join(root, 'native-result.json');
  await writeFile(report, JSON.stringify(actual, null, 2));
  native.status = 'passed';
  native.artifacts.push({ label: 'Unsupported-surface report', path: report });
  native.checks.push('Native claim yields no page evidence draft');
} catch (error) {
  native.status = 'failed';
  native.error = String(error);
}
await save();
if (rows.some((row) => row.status !== 'passed')) process.exitCode = 1;
