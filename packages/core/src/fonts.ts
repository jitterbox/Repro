import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { mapBounded } from './workers.js';
import { join, basename } from 'node:path';
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
    if (process.platform === 'win32') {
      const directory = join(process.env.WINDIR ?? 'C:/Windows', 'Fonts');
      const files = (await readdir(directory))
        .filter((name) => /\.(ttf|otf|ttc)$/i.test(name))
        .sort();
      return await mapBounded(files, 4, async (name) => ({
        family: basename(name),
        source: 'windows-font-directory',
        sha256: await hashFontFile(join(directory, name)),
      }));
    }
    const { stdout } = await execFileAsync(
      'fc-list',
      ['-f', '%{family[0]}\t%{file}\n'],
      { timeout: 2000 },
    );
    const lines = [...new Set(stdout.trim().split('\n'))].sort();
    return await mapBounded(lines, 4, async (line) => {
      const [family = 'unknown', path] = line.split('\t');
      return {
        family,
        source: 'fontconfig',
        sha256: path ? await hashFontFile(path) : null,
      };
    });
  } catch {
    return [];
  }
}

// Inventory may include large font collections. Stream a bounded number of files
// and reuse unchanged hashes between the start and completion manifests.
const fontHashes = new Map<
  string,
  { signature: string; hash: Promise<string> }
>();
export async function hashFontFile(path: string): Promise<string> {
  const info = await stat(path, { bigint: true });
  const signature = `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  const existing = fontHashes.get(path);
  if (existing?.signature === signature) return existing.hash;
  const hash = (async () => {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path)) digest.update(chunk as Buffer);
    const after = await stat(path, { bigint: true });
    if (
      `${after.dev}:${after.ino}:${after.size}:${after.mtimeNs}:${after.ctimeNs}` !==
      signature
    )
      throw new Error(`Font changed during inventory: ${path}`);
    return digest.digest('hex');
  })();
  fontHashes.set(path, { signature, hash });
  try {
    return await hash;
  } catch (error) {
    if (fontHashes.get(path)?.hash === hash) fontHashes.delete(path);
    throw error;
  }
}
