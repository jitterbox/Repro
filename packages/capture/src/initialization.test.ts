import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BrowserContext } from 'playwright';
import { expect, it, vi } from 'vitest';
import * as core from '@jitterbox/repro-core';
import { CaptureSession } from './capture-session.js';
it('closes its store when initialization fails while leaving caller-owned contexts alone', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'repro-init-failure-'));
  const failure = new Error('Page creation failed');
  const phases: string[] = [];
  const inventory = vi
    .spyOn(core, 'enumerateFonts')
    .mockImplementationOnce(() => {
      phases.push('font-inventory');
      return Promise.resolve([]);
    });
  const close = vi.fn(() => Promise.resolve());
  const context = {
    newPage: () => {
      phases.push('browser');
      return Promise.reject(failure);
    },
    close,
  } as unknown as BrowserContext;
  try {
    const session = new CaptureSession({ context, outputDir });
    const storeClose = vi.spyOn(session.store, 'close');
    await expect(session.start()).rejects.toThrow('Page creation failed');
    expect(phases).toEqual(['font-inventory', 'browser']);
    expect(storeClose).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    await session.dispose();
    expect(storeClose).toHaveBeenCalledOnce();
  } finally {
    inventory.mockRestore();
    await rm(outputDir, { recursive: true, force: true });
  }
});
