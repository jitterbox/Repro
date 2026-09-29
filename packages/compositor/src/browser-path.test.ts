import { expect, it } from 'vitest';
import { resolveHeadlessShellPath } from './browser-path.js';
it('resolves pinned headless shell in Linux and Windows custom caches including spaces', () => {
  expect(
    resolveHeadlessShellPath(
      '/opt/cache/chromium-1234/chrome-linux64/chrome',
      'linux',
    ),
  ).toBe(
    '/opt/cache/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
  );
  expect(
    resolveHeadlessShellPath(
      'C:\\Users\\QA Person\\browsers\\chromium-1234\\chrome-win64\\chrome.exe',
      'win32',
    ),
  ).toBe(
    'C:\\Users\\QA Person\\browsers\\chromium_headless_shell-1234\\chrome-headless-shell-win64\\chrome-headless-shell.exe',
  );
  expect(() => resolveHeadlessShellPath('/usr/bin/chromium', 'linux')).toThrow(
    'Unsupported',
  );
  expect(() =>
    resolveHeadlessShellPath(
      '/cache/chromium-1234/chrome-linux64/chrome',
      'darwin',
    ),
  ).toThrow('supported');
});
