import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
export interface FontManifestEntry {
  readonly family: string;
  readonly source: string;
  readonly sha256: string | null;
}

export async function enumerateFonts(): Promise<readonly FontManifestEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      'fc-list',
      ['-f', '%{family[0]}\t%{file}\n'],
      { timeout: 2000 },
    );
    const lines = [...new Set(stdout.trim().split('\n'))].sort();
    return await Promise.all(
      lines.map(async (line) => {
        const [family = 'unknown', path] = line.split('\t');
        return {
          family,
          source: 'fontconfig',
          sha256: path
            ? createHash('sha256')
                .update(await readFile(path))
                .digest('hex')
            : null,
        };
      }),
    );
  } catch {
    return [];
  }
}
