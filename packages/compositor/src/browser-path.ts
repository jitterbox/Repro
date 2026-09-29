import { access } from 'node:fs/promises';
import { win32, posix } from 'node:path';

/** Playwright 1.62's pinned headless-shell layout; supports custom browser caches. */
export function resolveHeadlessShellPath(
  executable: string,
  platform = process.platform,
) {
  const path = platform === 'win32' ? win32 : posix;
  const build = path.dirname(path.dirname(executable));
  const revision = (/^chromium-(\d+)$/.exec(path.basename(build)))?.[1];
  if (!revision)
    throw new Error(`Unsupported Playwright browser layout: ${executable}`);
  const folder =
    platform === 'win32'
      ? 'chrome-headless-shell-win64'
      : platform === 'linux'
        ? 'chrome-headless-shell-linux64'
        : undefined;
  if (!folder)
    throw new Error(
      `Scene rendering is supported on Windows x64 and Linux x64; received ${platform}`,
    );
  return path.join(
    path.dirname(build),
    `chromium_headless_shell-${revision}`,
    folder,
    platform === 'win32'
      ? 'chrome-headless-shell.exe'
      : 'chrome-headless-shell',
  );
}
export async function headlessShellPath(executable: string) {
  const resolved = resolveHeadlessShellPath(executable);
  try {
    await access(resolved);
  } catch {
    throw new Error(
      `Missing pinned Chromium headless shell at ${resolved}. Run repro setup.`,
    );
  }
  return resolved;
}
