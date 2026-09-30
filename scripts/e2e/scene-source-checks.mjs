/** Independent artifact/timing checks used by default-renderer acceptance. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export async function verifySceneSources(runDirectory, rendered, mapOverride) {
  const run = JSON.parse(
    await readFile(join(runDirectory, 'run.json'), 'utf8'),
  );
  const scene = JSON.parse(
    await readFile(join(rendered.directory, 'scene.json'), 'utf8'),
  );
  const mapping =
    mapOverride ??
    JSON.parse(
      await readFile(join(rendered.directory, 'frame-map.json'), 'utf8'),
    );
  const sources = run.artifacts.filter((a) =>
    ['source-frame', 'checkpoint'].includes(a.kind),
  );
  assert.equal(mapping.length, rendered.receipt.frameCount);
  assert.equal(rendered.receipt.layoutFramesChecked, mapping.length);
  assert.equal(rendered.receipt.randomSeekPassed, true);
  const hashes = new Map();
  for (const [i, frame] of mapping.entries()) {
    assert.equal(frame.frame, i);
    assert.ok(Math.abs(frame.outputMs - (i * 1000) / 30) < 0.001);
    const segment = scene.segments.find(
      (s) =>
        frame.outputMs >= s.outStartMs &&
        frame.outputMs < s.outStartMs + s.outDurationMs,
    );
    assert.ok(segment, 'Every output frame needs a declared beat');
    if (segment.sourceStartMs === undefined) {
      assert.equal(frame.sourceMs, null);
      continue;
    }
    assert.ok(
      Math.abs(
        frame.sourceMs -
          (segment.sourceStartMs +
            (frame.outputMs - segment.outStartMs) * segment.rate),
      ) < 0.001,
    );
    assert.ok(
      sources.some((a) => a.sha256 === frame.sourceSha256),
      `Unknown source identity: ${frame.sourceFrameId}`,
    );
    assert.ok(
      frame.capturedSourceMs <= frame.sourceMs + 0.001,
      'Source selection must not show a future frame',
    );
    if (!hashes.has(frame.asset))
      hashes.set(
        frame.asset,
        createHash('sha256')
          .update(await readFile(join(rendered.directory, frame.asset)))
          .digest('hex'),
      );
    assert.equal(
      hashes.get(frame.asset),
      frame.sanitizedSha256,
      'Derived imagery must match its sanitized asset',
    );
  }
  return { scene, mapping, verifiedFrames: mapping.length };
}
