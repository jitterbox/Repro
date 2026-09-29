import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** libass uses native file IO that cannot open deeply nested Windows paths. */
export async function withAssSource<T>(
  source: string,
  render: (path: string) => Promise<T>,
  platform: NodeJS.Platform = process.platform,
): Promise<T> {
  if (platform !== 'win32') return render(source);
  const directory = await mkdtemp(join(tmpdir(), 'repro-ass-'));
  const path = join(directory, 'overlay.ass');
  try {
    await copyFile(source, path);
    return await render(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
