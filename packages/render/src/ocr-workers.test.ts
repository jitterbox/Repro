import type * as ChildProcesses from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  active: 0,
  peak: 0,
  calls: [] as string[],
  fail: false,
}));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof ChildProcesses>()),
  spawn: (_command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    if (args[0] === '--version') {
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('tesseract test'));
        child.emit('close', 0);
      });
    } else {
      state.calls.push(`${args[0]}:${args.at(-1)}`);
      state.peak = Math.max(state.peak, ++state.active);
      setTimeout(() => {
        state.active--;
        child.stdout.emit(
          'data',
          Buffer.from(args[0]?.endsWith('b.png') ? 'PRIVATE PHRASE' : 'safe'),
        );
        child.emit('close', state.fail && args[0]?.endsWith('a.png') ? 1 : 0);
      }, 10);
    }
    return child;
  },
}));
import { TesseractOcrAdapter } from './redaction.js';

it('synthetic OCR transport bounds workers, deduplicates frames and scans both layouts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-ocr-workers-'));
  try {
    const paths = ['a', 'b', 'duplicate', 'c'].map((name) =>
      join(root, `${name}.png`),
    );
    for (const [i, path] of paths.entries())
      await writeFile(path, i === 2 ? '0' : String(i));
    state.calls = [];
    state.peak = 0;
    state.fail = false;
    const input = {
      frameDir: root,
      framePaths: paths,
      videoPath: '',
      sidecarPath: '',
      patterns: ['PRIVATE PHRASE'],
    };
    const result = await new TesseractOcrAdapter(2).scan(input);
    expect(result.audited).toBe(true);
    expect(result.framesScanned).toBe(4);
    expect(result.hits).toContainEqual({
      text: 'PRIVATE PHRASE',
      confidence: 1,
    });
    expect(state.calls).toHaveLength(6);
    expect(state.calls.filter((call) => call.endsWith(':3'))).toHaveLength(3);
    expect(state.calls.filter((call) => call.endsWith(':11'))).toHaveLength(3);
    expect(state.peak).toBe(2);
    state.fail = true;
    state.calls = [];
    await expect(new TesseractOcrAdapter(2).scan(input)).rejects.toThrow(
      'OCR worker failed',
    );
    expect(state.active).toBe(0);
    expect(state.calls.some((call) => call.includes('c.png'))).toBe(false);
    expect(() => new TesseractOcrAdapter(9)).toThrow('between 1 and 8');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
