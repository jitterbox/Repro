import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  implementationDigest,
  mapBounded,
  runProcess,
} from '@jitterbox/repro-core';
import { spatialOcrHits } from './ocr-spatial.js';
import type { OcrAdapterInput, OcrAdapterResult, OcrHit } from './redaction.js';

const hash = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
export const OCR_POLICY_VERSION = '2.0.0';

async function cacheIdentity(version: string, patterns: readonly string[]) {
  try {
    const langs = await runProcess('tesseract', ['--list-langs']);
    const directory = /List of available languages in "([^"]+)"/.exec(
      langs,
    )?.[1];
    if (!directory) return undefined;
    const model = hash(await readFile(join(directory, 'eng.traineddata')));
    return hash(
      JSON.stringify({
        version,
        model,
        policy: OCR_POLICY_VERSION,
        detectors: implementationDigest(
          createRequire(import.meta.url).resolve(
            '@jitterbox/repro-core/redactor',
          ),
        ),
        patterns,
        implementation: implementationDigest(
          new URL('./ocr-spatial.js', import.meta.url).href,
        ),
        adapter: implementationDigest(
          new URL('./ocr-batch.js', import.meta.url).href,
        ),
        modes: [3, 11],
      }),
    );
  } catch {
    return undefined;
  } // Unidentified models disable reuse, never the scan.
}

export async function scanOcrBatches(
  input: OcrAdapterInput,
  workers: number,
): Promise<OcrAdapterResult> {
  const started = performance.now();
  let version: string;
  try {
    version =
      (await runProcess('tesseract', ['--version'])).split('\n')[0] ??
      'unknown';
  } catch {
    return { audited: false, hits: [] };
  }
  const frames = new Map<
    string,
    { path: string; indices: number[]; hits?: readonly OcrHit[] }
  >();
  for (const [index, path] of input.framePaths.entries()) {
    const digest = hash(await readFile(path));
    const frame = frames.get(digest);
    if (frame) frame.indices.push(index);
    else frames.set(digest, { path, indices: [index] });
  }
  const identity = input.cacheDir
    ? await cacheIdentity(version, input.patterns ?? [])
    : undefined;
  const cache =
    identity && input.cacheDir ? join(input.cacheDir, identity) : undefined;
  if (cache) await mkdir(cache, { recursive: true, mode: 0o700 });
  let cacheHits = 0,
    batchesScanned = 0,
    completed = 0;
  for (const [digest, frame] of frames) {
    if (!cache) break;
    try {
      const record = JSON.parse(
        await readFile(join(cache, `${digest}.json`), 'utf8'),
      ) as { digest: string; hits: OcrHit[]; checksum: string };
      if (
        record.digest === digest &&
        Array.isArray(record.hits) &&
        record.checksum === hash(JSON.stringify(record.hits)) &&
        record.hits.every(
          (h) =>
            typeof h.text === 'string' &&
            Number.isFinite(h.confidence) &&
            ['3', '11'].includes(h.mode ?? ''),
        )
      ) {
        frame.hits = record.hits;
        cacheHits++;
      }
    } catch {
      /* Missing or corrupt cache entries are scanned again. */
    }
  }
  input.onProgress?.({
    phase: 'ocr',
    completed: cacheHits,
    total: frames.size,
  });
  const pending = [...frames].filter(([, frame]) => !frame.hits);
  const batches = Array.from(
    { length: Math.ceil(pending.length / 8) },
    (_, i) => pending.slice(i * 8, i * 8 + 8),
  );
  await mapBounded(batches, workers, async (batch) => {
    const id = randomUUID(),
      list = join(input.frameDir, `batch-${id}.txt`);
    await writeFile(list, batch.map(([, f]) => f.path).join('\n') + '\n', {
      mode: 0o600,
    });
    const found = batch.map((): OcrHit[] => []);
    for (const mode of ['3', '11']) {
      const output = join(input.frameDir, `ocr-${id}-${mode}`);
      await runProcess(
        'tesseract',
        [list, output, '-l', 'eng', '--psm', mode, 'tsv'],
        { env: { ...process.env, OMP_THREAD_LIMIT: '1' } },
      );
      const pages = spatialOcrHits(
        await readFile(`${output}.tsv`, 'utf8'),
        input.patterns,
      );
      if (
        pages.size !== batch.length ||
        batch.some((_, i) => !pages.has(i + 1))
      )
        throw new Error('Incomplete frame OCR batch');
      for (let i = 0; i < batch.length; i++)
        required(found[i]).push(
          ...required(pages.get(i + 1)).map((h) => ({ ...h, mode })),
        );
    }
    for (const [i, [digest, frame]] of batch.entries()) {
      frame.hits = required(found[i]);
      if (cache) {
        const temporary = join(cache, `${digest}.${id}.tmp`);
        await writeFile(
          temporary,
          JSON.stringify({
            digest,
            hits: frame.hits,
            checksum: hash(JSON.stringify(frame.hits)),
          }),
          { mode: 0o600 },
        );
        await rename(temporary, join(cache, `${digest}.json`));
      }
    }
    batchesScanned++;
    completed += batch.length;
    input.onProgress?.({
      phase: 'ocr',
      completed: cacheHits + completed,
      total: frames.size,
    });
  });
  const hits = [...frames.values()].flatMap((frame) =>
    (frame.hits ?? []).map((hit) => ({
      ...hit,
      frame: required(frame.indices[0]),
      occurrences: frame.indices,
    })),
  );
  return {
    audited: input.framePaths.length > 0,
    source: 'frame-ocr',
    framesScanned: input.framePaths.length,
    toolVersion: version,
    hits,
    stats: {
      frames: input.framePaths.length,
      uniqueFrames: frames.size,
      cacheHits,
      scannedFrames: pending.length,
      batches: batchesScanned,
      workers,
      ocrMs: performance.now() - started,
    },
  };
}

function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null)
    throw new Error('Incomplete OCR data');
  return value;
}
