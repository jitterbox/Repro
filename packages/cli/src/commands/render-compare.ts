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
  const composition = JSON.parse(await readFile(options.composition, 'utf8'));

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
