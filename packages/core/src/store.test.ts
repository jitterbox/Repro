import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ReproStore } from './store.js';

import type { ReproConfig } from './schema.js';

const baseConfig = {
  features: {},
  metadata: {},
  mode: 'repro',
  profile: 'controlled',
  surfaceCapture: 'page',
  viewport: {
    deviceScaleFactor: 1,
    height: 720,
    width: 1280,
  },
} satisfies ReproConfig;

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir === undefined) {
    return;
  }

  await rm(tempDir, { force: true, recursive: true });
  tempDir = undefined;
});

describe('ReproStore', () => {
  it('roundtrips runs, hash-chained events, frames, stages, and JSONL', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'repro-core-'));
    const store = new ReproStore({ path: join(tempDir, 'repro.db') });
    const runId = store.createRun({ config: baseConfig, id: 'run-1' });

    const first = store.appendEvent({
      id: 'event-1',
      kind: 'page.click',
      pageId: 'page-1',
      payload: { selector: '#save' },
      runId,
      schemaVersion: 1,
      seq: 1,
      t_mono: 10,
    });
    const second = store.appendEvent({
      id: 'event-2',
      kind: 'page.input',
      pageId: 'page-1',
      payload: { value: 'ok' },
      runId,
      schemaVersion: 1,
      seq: 2,
      t_mono: 20,
    });

    store.appendFrame({
      droppedCount: 0,
      height: 720,
      pageId: 'page-1',
      path: 'frames/1.png',
      runId,
      seq: 1,
      sourceTs: 10,
      t_mono: 10,
      width: 1280,
    });
    store.markStage({
      cacheKey: 'cache-1',
      completedAtEpoch: 1,
      manifestPath: 'stage/manifest.json',
      name: 'capture',
      runId,
      status: 'complete',
    });

    const lines = store.exportJsonl({ runId }).trim().split('\n');
    const stage = store.getStage({ name: 'capture', runId });

    expect(second.prevHash).toBe(first.hash);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ id: 'event-1' });
    expect(stage).toMatchObject({ cacheKey: 'cache-1', status: 'complete' });

    store.close();
  });
});
