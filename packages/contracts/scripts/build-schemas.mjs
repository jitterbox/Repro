import { readFile, writeFile } from 'node:fs/promises';
import { compareCompositionJsonSchema } from '../dist/comparison.js';
import { planJsonSchema } from '../dist/plan.js';
import { scenePlanJsonSchema, treatmentPlanJsonSchema } from '../dist/scene.js';
import { timelineJsonSchema } from '../dist/timeline.js';

for (const [name, schema] of [
  ['compare-composition', compareCompositionJsonSchema],
  ['timeline', timelineJsonSchema],
  ['executable-plan', planJsonSchema],
  ['scene-plan', scenePlanJsonSchema],
  ['treatment-plan', treatmentPlanJsonSchema],
]) {
  const destination = new URL(
    `../schemas/${name}.schema.json`,
    import.meta.url,
  );
  const serialized = `${JSON.stringify(schema, null, 2)}\n`;
  if (process.argv.includes('--write-source'))
    await writeFile(destination, serialized);
  else if (
    JSON.stringify(JSON.parse(await readFile(destination, 'utf8'))) !==
    JSON.stringify(schema)
  )
    throw new Error(
      `Published ${name} schema is stale. Run pnpm --filter @jitterbox/repro-contracts generate:schemas and review the generated change.`,
    );
}
