import { compareEvidence } from '../comparison.js';
import { writeFile, stat } from 'node:fs/promises';

import { compareRuns } from '@repro/compare';

export interface CompareCommandOptions {
  readonly left: string;
  readonly right: string;
  readonly out?: string;
  readonly overrideEnvDrift?: boolean;
}

export async function compareCommand(options: CompareCommandOptions) {
  if ((await stat(options.left)).isDirectory())
    return compareEvidence(options.left, options.right, options.out);
  const result = await compareRuns({
    left: options.left,
    overrideEnvDrift: options.overrideEnvDrift === true,
    right: options.right,
  });

  if (options.out !== undefined) {
    await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}
