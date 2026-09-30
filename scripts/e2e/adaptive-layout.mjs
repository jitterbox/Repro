/** Render-only regression using an existing real Web-Dash run. No recapture. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const run = process.argv[2];
if (!run)
  throw new Error(
    'Usage: node scripts/e2e/adaptive-layout.mjs <existing-sales-calendar-run>',
  );
const out = resolve('.repro/adaptive-layout');
await mkdir(out, { recursive: true });
const treatment = JSON.parse(
  await readFile(
    'packages/playwright/examples/web-dash/sales-calendar.treatment.json',
    'utf8',
  ),
);
treatment.style = { minHeight: 960 };
treatment.steps.push({ step: 'verify', sequence: 'workflow', numbered: false });
treatment.layout = { overlayPanels: 'as-needed', minStepVisibleMs: 5000 };
treatment.treatments.push(
  {
    id: 'magnifier',
    kind: 'magnifier',
    checkpoint: 'result',
    target: 'detail',
    magnification: 2,
    title: 'Calendar detail',
    rationale: 'Measured enlargement of the recorded calendar.',
  },
  {
    id: 'state',
    kind: 'data-panel',
    eventKind: 'scenario.state',
    eventMatch: { name: 'page' },
    valuePath: 'value',
    format: 'object',
    title: 'Developer data',
    rationale: 'Replay the captured page state in source time.',
  },
);
const file = join(out, 'treatment.json');
await writeFile(file, JSON.stringify(treatment, null, 2));
const cli = async (...args) => {
  const result = await exec(
    process.execPath,
    [
      resolve('packages/cli/dist/bin.js'),
      '--workflow-log',
      join(out, 'workflow.jsonl'),
      ...args,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(result.stdout);
};
await cli('validate-treatment', file);
const rendered = await cli('render', resolve(run), '--treatment', file);
const layout = JSON.parse(
  await readFile(join(rendered.directory, 'layout.json'), 'utf8'),
);
const scene = JSON.parse(
  await readFile(join(rendered.directory, 'scene.json'), 'utf8'),
);
assert.equal(scene.output.height, 960);
assert.ok(
  Object.keys(layout.retired).length,
  'Old steps should retire under pressure',
);
assert.equal(rendered.receipt.randomSeekPassed, true);
assert.equal(rendered.receipt.layoutFramesChecked, rendered.receipt.frameCount);
await writeFile(
  join(out, 'result.json'),
  JSON.stringify(
    {
      rendered,
      retired: layout.retired,
      overlayBeats: layout.beats.filter((b) =>
        b.panels.some((p) => p.zone === 'overlay'),
      ).length,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      video: rendered.outputPath,
      directory: rendered.directory,
      retired: layout.retired,
    },
    null,
    2,
  ),
);
