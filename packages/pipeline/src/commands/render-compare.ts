import { readFile } from 'node:fs/promises';

import { renderCompare } from '@repro/render';

export interface RenderCompareCommandOptions {
  readonly composition: string;
  readonly videoA: string;
  readonly videoB: string;
  readonly outDir: string;
  readonly ffmpegPath?: string;
}

export async function renderCompareCommand(
  options: RenderCompareCommandOptions,
) {
  const document = JSON.parse(
    await readFile(options.composition, 'utf8'),
  ) as Record<string, unknown>;
  // Public compare writes a report containing its measured composition. Keep
  // direct legacy composition documents usable through this same adapter.
  const composition =
    document.composition && typeof document.composition === 'object'
      ? (document.composition as Record<string, unknown>)
      : document;

  return renderCompare({
    composition,
    outDir: options.outDir,
    videoA: options.videoA,
    videoB: options.videoB,
    ...(options.ffmpegPath === undefined
      ? {}
      : { ffmpegPath: options.ffmpegPath }),
  });
}
