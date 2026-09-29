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
      return await inventoryFontFiles(
        files.map((name) => ({
          family: basename(name),
          source: 'windows-font-directory',
          path: join(directory, name),
        })),
      );
    }
    const { stdout } = await execFileAsync(
      'fc-list',
      ['-f', '%{family[0]}\t%{file}\n'],
      { timeout: 2000 },
    );
    const lines = [...new Set(stdout.trim().split('\n'))].sort();
    return await inventoryFontFiles(
      lines.map((line) => {
        const [family = 'unknown', path = ''] = line.split('\t');
        return { family, source: 'fontconfig', path };
      }),
    );
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
export async function hashFontFile(
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const info = await stat(path, { bigint: true });
  signal?.throwIfAborted();
  const signature = `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  const existing = fontHashes.get(path);
  if (existing?.signature === signature) return existing.hash;
  const hash = (async () => {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(path, { signal }))
      digest.update(chunk as Buffer);
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

// Host inventory is supplemental evidence. A stalled filesystem must not exhaust
// Playwright's fixture budget. Unknown hashes stay null; verified comparison
// already rejects missing font provenance. Do not retry stalled files in the
// recording's later environment snapshots and insert another blank interval.
const unavailableFonts = new Set<string>();
export async function inventoryFontFiles(
  files: readonly { family: string; source: string; path: string }[],
  readFont: typeof hashFontFile = hashFontFile,
  timeoutMs = 10_000,
): Promise<readonly FontManifestEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await mapBounded(files, 4, async ({ family, source, path }) => {
      let sha256: string | null = null;
      if (path && !unavailableFonts.has(path) && !controller.signal.aborted) {
        try {
          sha256 = await abortable(
            readFont(path, controller.signal),
            controller.signal,
          );
        } catch {
          unavailableFonts.add(path);
        }
      } else if (controller.signal.aborted) unavailableFonts.add(path);
      return { family, source, sha256 };
    });
  } finally {
    clearTimeout(timer);
  }
}

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(new Error('Font inventory deadline exceeded'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(
          error instanceof Error
            ? error
            : new Error('Font read failed', { cause: error }),
        );
      },
    );
  });
}
