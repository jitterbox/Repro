import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderSceneInProcess } from './scene-render.js';
import { renderSceneComparisonInProcess } from './scene-compare.js';
const path = process.argv[2];
if (!path) throw new Error('Render request path required');
const request = JSON.parse(await readFile(path, 'utf8')) as Parameters<
  typeof renderSceneInProcess
>[0];
const result =
  'comparison' in request
    ? await renderSceneComparisonInProcess(
        request as unknown as Parameters<
          typeof renderSceneComparisonInProcess
        >[0],
      )
    : await renderSceneInProcess(request);
await writeFile(
  join(request.outDir, 'render-result.json'),
  JSON.stringify(result),
);
