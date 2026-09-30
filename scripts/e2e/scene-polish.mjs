import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, join } from 'node:path';
const exec = promisify(execFile);
const root = resolve(process.env.REPRO_SCENE_OUT ?? '.repro/scene-polish');
await mkdir(root, { recursive: true });
async function cli(...args) {
  try {
    const { stdout } = await exec(
      process.execPath,
      [resolve('packages/cli/dist/bin.js'), ...args],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    return args[0] === 'validate-config'
      ? { ok: true, message: stdout }
      : JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `${args[0]} failed: ${error.stdout ?? ''}\n${error.stderr ?? error}`,
    );
  }
}
const config = {
  mode: 'repro',
  profile: 'controlled',
  surfaceCapture: 'page',
  features: { clickViz: true, redaction: true },
  viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  redaction: { strict: true, masks: [] },
};

const results = [];
for (const kind of process.env.REPRO_SCENE_KIND
  ? [process.env.REPRO_SCENE_KIND]
  : ['menu', 'geometry', 'transient']) {
  config.profile = kind === 'transient' ? 'faithful' : 'controlled';
  await writeFile(join(root, 'repro.config.json'), JSON.stringify(config));
  await cli('validate-config', '--config', join(root, 'repro.config.json'));
  for (const role of process.env.REPRO_SCENE_ROLE
    ? [process.env.REPRO_SCENE_ROLE]
    : ['before', 'after']) {
    const steps =
      kind === 'menu'
        ? [
            ['prepare', 'Open workspace settings'],
            [
              'workspace',
              'Open the workspace menu to find workspace preferences',
            ],
            [
              'preferences',
              'Choose Preferences, then open the nested notification options',
            ],
            ['notifications', 'Disable notifications for this workspace'],
            ['verify', 'Inspect the persisted preference'],
          ]
        : [
            ['prepare', 'Establish the initial state'],
            [
              'trigger',
              kind === 'geometry' ? 'Refresh the invoice' : 'Load the account',
            ],
            ['verify', 'Verify the resulting state'],
          ];
    const spec = {
      schemaVersion: '1.0.0',
      id: `scene-${kind}`,
      title:
        kind === 'menu'
          ? 'Notification preference does not persist'
          : kind === 'geometry'
            ? 'Invoice total shifts after refresh'
            : 'Account details flash during loading',
      variant: {
        id: role,
        role,
        label: role === 'before' ? 'Before' : 'After',
      },
      claim:
        kind === 'menu'
          ? 'Notification preference remains enabled'
          : kind === 'geometry'
            ? 'Invoice edge shifts 12px'
            : 'Account details disappear briefly',
      expected:
        kind === 'menu'
          ? 'Notifications remain disabled after saving'
          : kind === 'geometry'
            ? 'Invoice total aligns with the reference edge'
            : 'Account details remain visible throughout loading',
      targets: [
        { id: 'target', description: 'Affected content' },
        ...(kind === 'geometry'
          ? [{ id: 'reference', description: 'Reference edge' }]
          : []),
      ],
      steps: steps.map(([id, title]) => ({
        id,
        title,
        trigger: id === (kind === 'menu' ? 'notifications' : 'trigger'),
      })),
      segments:
        kind === 'transient'
          ? [
              {
                id: 'loading',
                title: 'Account loading interval',
                step: 'trigger',
                required: true,
              },
            ]
          : [],
      checkpoints: [
        ...(kind === 'menu'
          ? [
              {
                id: 'workspace-open',
                step: 'workspace',
                title: 'Workspace menu',
                targets: [],
                observations: ['screenshot'],
              },
              {
                id: 'preferences-open',
                step: 'preferences',
                title: 'Nested preferences',
                targets: [],
                observations: ['screenshot'],
              },
            ]
          : []),
        ...(kind === 'transient'
          ? [
              {
                id: 'during',
                step: 'trigger',
                title: 'Captured transient state',
                targets: [],
                observations: ['screenshot'],
                timing: 'transient',
                frame: {
                  segment: 'loading',
                  event: {
                    kind: 'probe.pointer:path',
                    match: { phase: 'pointerdown' },
                    occurrence: 0,
                  },
                  offsetMs: 100,
                  maxOffsetMs: 67,
                },
              },
            ]
          : []),
        {
          id: 'result',
          step: 'verify',
          title: 'Measured outcome',
          targets: kind === 'geometry' ? ['target', 'reference'] : ['target'],
          observations: ['screenshot', 'bounds', 'assertion'],
          highlights:
            kind === 'geometry'
              ? []
              : [
                  {
                    target: 'target',
                    label:
                      kind === 'menu'
                        ? 'Saved preference value'
                        : 'Recovered account content',
                  },
                ],
        },
      ],
      outputs: ['png', 'mp4', 'review', 'package'],
      presentation: { readingHoldMs: 1500 },
      privacy: { strict: true, selectors: [], patterns: [] },
    };
    const treatments = {
      schemaVersion: '1.0.0',
      treatments:
        kind === 'geometry'
          ? [
              {
                id: 'edge-gap',
                kind: 'alignment',
                checkpoint: 'result',
                target: 'target',
                reference: 'reference',
                axis: 'x',
                title: 'Measured alignment gap',
                rationale: 'Compare actual left edges',
              },
              {
                id: 'detail',
                kind: 'magnifier',
                checkpoint: 'result',
                target: 'target',
                title: 'Inspect the invoice edge',
                rationale: 'Expose the small displacement',
                magnification: 2,
              },
            ]
          : kind === 'transient'
            ? [
                {
                  id: 'slow-loading',
                  kind: 'slowmo',
                  segment: 'loading',
                  rate: 0.1,
                  title: 'Loading replay',
                  rationale: 'Make the captured transient readable',
                },
                {
                  id: 'request-events',
                  kind: 'data-panel',
                  eventKind: 'browser.console',
                  title: 'Account request',
                  rationale: 'Show recorded lifecycle messages',
                },
              ]
            : [],
    };
    const evidence = join(root, `${kind}-${role}.evidence.json`),
      treatment = join(root, `${kind}-${role}.treatment.json`);
    await writeFile(evidence, JSON.stringify(spec, null, 2));
    await writeFile(treatment, JSON.stringify(treatments, null, 2));
    await cli('validate-evidence', evidence);
    await cli('validate-treatment', treatment);
    const result = await cli(
      'run',
      `packages/playwright/examples/scene-${kind}.spec.ts`,
      '--playwright-config',
      'packages/playwright/examples/scene.config.ts',
      '--config',
      join(root, 'repro.config.json'),
      '--evidence',
      evidence,
      '--url',
      `http://127.0.0.1:3207/${kind}${role === 'after' ? '?fixed=1' : ''}`,
      '--out-dir',
      root,
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    const run = result.runs[0].directory;
    const rendered = await cli('render', run, '--treatment', treatment);
    const manifest = JSON.parse(await readFile(join(run, 'run.json'), 'utf8'));
    assert.equal(
      manifest.scenarioOutcome,
      role === 'before' ? 'bug-reproduced' : 'fix-verified',
    );
    results.push({ kind, role, run, rendered });
    await writeFile(
      join(root, 'results.json'),
      JSON.stringify(results, null, 2),
    );
    console.log(`${kind} ${role}: ${rendered.outputPath}`);
  }
}
