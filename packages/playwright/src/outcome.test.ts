import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import type { CaptureSession } from '@repro/capture';
import { validateEvidence } from '@repro/contracts';
import { EvidenceRecorder } from './index.js';

it('records ordinary checkpoint checks without treating their failures as reproduced bugs', async () => {
  const page = {} as Page;
  const ready = vi.fn().mockResolvedValue('page-1');
  const session = {
    page,
    ready,
    clock: { nowMono: () => 42 },
  } as unknown as CaptureSession;
  const spec = validateEvidence(
    JSON.parse(
      await readFile(
        new URL('../examples/before.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const recorder = new EvidenceRecorder(session, spec, '/run');
  await recorder.check(
    'result',
    'Cart is loaded',
    () => Promise.resolve(),
    page,
  );
  const failure = new Error('Unexpected setup failure');
  await expect(
    recorder.check(
      'result',
      'Cart remains loaded',
      () => Promise.reject(failure),
      page,
    ),
  ).rejects.toBe(failure);
  expect(recorder.designatedChecks).toEqual([]);
  expect(recorder.observations).toMatchObject([
    {
      kind: 'assertion',
      status: 'passed',
      pageId: 'page-1',
      data: {
        designated: false,
        assertionPassed: true,
        expected: 'Cart is loaded',
      },
    },
    {
      kind: 'assertion',
      status: 'failed',
      pageId: 'page-1',
      data: {
        designated: false,
        assertionPassed: false,
        expected: 'Cart remains loaded',
      },
    },
  ]);
  await expect(
    recorder.check(
      'missing',
      'Invalid checkpoint',
      () => Promise.resolve(),
      page,
    ),
  ).rejects.toThrow('Unknown checkpoint');
});

it('registers the selected popup before its assertion and records its actual identity', async () => {
  const popup = {} as Page;
  const ready = vi.fn().mockResolvedValue('page-2');
  const session = {
    ready,
    clock: { nowMono: () => 42 },
  } as unknown as CaptureSession;
  const spec = validateEvidence(
    JSON.parse(
      await readFile(
        new URL('../examples/after.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  const recorder = new EvidenceRecorder(session, spec, '/run');
  await recorder.outcome(
    'result',
    () => {
      expect(ready).toHaveBeenCalledWith(popup);
      return Promise.resolve();
    },
    popup,
  );
  expect(recorder.observations[0]).toMatchObject({
    pageId: 'page-2',
    kind: 'assertion',
    data: { assertionPassed: true },
  });
});
