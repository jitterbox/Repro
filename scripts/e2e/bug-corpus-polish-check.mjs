import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('.repro/bug-corpus');
const results = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
const report = [];
await mkdir(join(root, 'transitions'), { recursive: true });
for (const r of results) {
  const scene = JSON.parse(
    await readFile(join(r.rendered.directory, 'scene.json'), 'utf8'),
  );
  const receipt = JSON.parse(
    await readFile(join(r.rendered.directory, 'render-receipt.json'), 'utf8'),
  );
  assert.equal(receipt.randomSeekPassed, true);
  assert.equal(receipt.layoutFramesChecked, receipt.frameCount);
  const bug = scene.cues.find((c) => c.id === 'bug-detail');
  assert.ok(
    bug && bug.endMs - bug.startMs >= 5350,
    `${r.kind}: bug reading time`,
  );
  const markers = scene.cues.filter((c) => c.kind === 'marker');
  assert.ok(markers.length >= 2, `${r.kind}: observed actions`);
  assert.ok(
    markers.every((c) => c.endMs - c.startMs >= 1500),
    `${r.kind}: step reading time`,
  );
  assert.ok(
    scene.cursorSamples.length >= 30,
    `${r.kind}: captured mouse paths`,
  );
  for (const c of markers)
    assert.ok(
      !scene.cues.some((s) => s.id === c.id.replace('marker-', 'step-')),
      'Duplicate step panel',
    );
  const firstDown = scene.cursorSamples.findIndex(
    (p) => p.phase === 'pointerdown',
  );
  assert.ok(firstDown >= 10, `${r.kind}: paced approach before click`);
  const move = scene.cursorSamples.slice(0, firstDown + 1),
    a = move[0],
    b = move.at(-1);
  const deviation = Math.max(
    ...move.map(
      (p) =>
        Math.abs(
          (b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x,
        ) / Math.hypot(b.y - a.y, b.x - a.x),
    ),
  );
  assert.ok(deviation > 2, `${r.kind}: recorded curved approach`);
  if (r.kind === 'flash' || r.kind === 'sticky') {
    const action = scene.segments.find((s) => s.id === 'play-action');
    const hold = scene.segments.find((s) => s.kind === 'hold');
    const events = (await readFile(join(r.run, 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const trigger = events.find(
      (e) =>
        e.t_mono >= action.sourceStartMs &&
        (r.kind === 'flash'
          ? e.kind === 'probe.pointer:path' && e.payload.phase === 'pointerup'
          : e.kind === 'probe.browser-state' && e.payload.phase === 'scroll'),
    );
    assert.ok(
      trigger &&
        hold.sourceStartMs >= trigger.t_mono &&
        hold.sourceStartMs - trigger.t_mono <= 107,
      `${r.kind}: decisive hold must follow the actual click release/scroll, within measured capture tolerance`,
    );
  }
  for (const [label, time] of [
    ['entry', bug.startMs + 67],
    ['hold', bug.startMs + 1500],
    ['exit', bug.endMs - 67],
  ]) {
    await copyFile(
      join(
        r.rendered.directory,
        'frames',
        `frame_${String(Math.round((time * 30) / 1000)).padStart(6, '0')}.png`,
      ),
      join(root, 'transitions', `${r.kind}-${r.role}-${label}.png`),
    );
  }
  report.push({
    kind: r.kind,
    role: r.role,
    bugOpaqueSeconds: (bug.endMs - bug.startMs - 350) / 1000,
    markers: markers.length,
    cursorSamples: scene.cursorSamples.length,
    approachDeviationCssPx: deviation,
    randomSeekPassed: true,
    framesChecked: receipt.frameCount,
  });
}
await writeFile(
  join(root, 'polish-acceptance.json'),
  JSON.stringify(report, null, 2),
);
console.log(
  `Validated readable pacing, recorded curves, numbered groups and ${report.reduce((n, r) => n + r.framesChecked, 0)} rendered frames across ${report.length} recordings.`,
);
