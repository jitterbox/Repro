import { expect, it } from 'vitest';
import { setupCommands } from './setup.js';
it('plans exact Windows package IDs without shell commands or browser changes when disabled', () => {
  const plan = setupCommands('win32', { system: true, browser: false });
  expect(plan.map((p) => p.command)).toEqual(['winget', 'winget']);
  expect(plan[0]?.args).toContain('Gyan.FFmpeg');
  expect(plan[1]?.args).toContain('UB-Mannheim.TesseractOCR');
});
it('provisions Debian dependencies and the same pinned Playwright for the current Node runtime', () => {
  const plan = setupCommands('linux', { system: true, linuxId: 'ubuntu' });
  expect(plan[1]?.args).toContain('tesseract-ocr-eng');
  expect(plan[2]?.command).toBe(process.execPath);
  expect(plan[2]?.args.slice(-3)).toEqual([
    'install',
    '--with-deps',
    'chromium',
  ]);
  expect(setupCommands('linux', { browser: false })).toEqual([]);
  expect(() =>
    setupCommands('linux', { system: true, linuxId: 'alpine' }),
  ).toThrow('distribution');
  expect(() => setupCommands('darwin')).toThrow('Windows and Linux');
});
