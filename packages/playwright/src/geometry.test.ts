import { expect, it, vi } from 'vitest';
import type { Locator, Page } from '@playwright/test';
import type { CaptureSession } from '@repro/capture';
import { validateEvidence } from '@repro/contracts';
import { EvidenceRecorder } from './index.js';

it('does not invent a crop when a target moves across the screenshot interval', async () => {
  const page = {} as Page;
  const session = {
    page,
    config: { viewport: { width: 1280, height: 720, deviceScaleFactor: 1 } },
    clock: { nowMono: () => 10 },
    captureAnchor: vi.fn(() =>
      Promise.resolve({
        pageId: 'page-1',
        path: '/run/context.png',
        tMono: 2,
        endMono: 8,
      }),
    ),
  } as unknown as CaptureSession;
  const spec = validateEvidence({
    schemaVersion: '1.0.0',
    id: 'moving',
    title: 'Moving target',
    variant: { id: 'before', role: 'before', label: 'Before' },
    claim: 'Target moves',
    expected: 'Target remains aligned',
    targets: [{ id: 'target', description: 'Control' }],
    steps: [{ id: 'trigger', title: 'Trigger movement', trigger: true }],
    checkpoints: [
      {
        id: 'result',
        step: 'trigger',
        title: 'Result',
        targets: ['target'],
        required: true,
        observations: ['screenshot', 'bounds'],
        timing: 'transient',
      },
    ],
    outputs: ['png'],
    presentation: {},
    privacy: {},
  });
  const locator = {
    page: () => page,
    evaluate: () => Promise.resolve({ text: 'Control' }),
    count: () => Promise.resolve(1),
    boundingBox: vi
      .fn()
      .mockResolvedValueOnce({ x: 1, y: 2, width: 40, height: 20 })
      .mockResolvedValueOnce({ x: 12, y: 2, width: 40, height: 20 }),
  } as unknown as Locator;
  const recorder = new EvidenceRecorder(session, spec, '/run');
  recorder.target('target', locator);
  await recorder.checkpoint('result');
  expect(
    recorder.observations.find((o) => o.kind === 'screenshot')?.status,
  ).toBe('passed');
  const bounds = recorder.observations.find((o) => o.kind === 'bounds');
  expect(bounds?.status).toBe('unsupported');
  expect(bounds?.bounds).toBeNull();
  expect(bounds?.data?.crop).toBeUndefined();
  expect(bounds?.data?.measuredBefore).toMatchObject({ x: 1 });
  expect(bounds?.data?.measuredAfter).toMatchObject({ x: 12 });
});
