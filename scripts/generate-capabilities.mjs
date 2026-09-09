import { mkdir, writeFile } from 'node:fs/promises';
import {
  capabilities,
  evidenceJsonSchema,
  runJsonSchema,
  configJsonSchema,
  compareCompositionJsonSchema,
  timelineJsonSchema,
  planJsonSchema,
} from '../packages/contracts/dist/index.js';
import { recipes } from '../packages/pipeline/dist/index.js';
const output = 'packages/contracts/dist/discovery';
await mkdir(output, { recursive: true });
for (const [name, data] of Object.entries({
  capabilities,
  recipes,
  'evidence.schema': evidenceJsonSchema,
  'run.schema': runJsonSchema,
  'config.schema': configJsonSchema,
  'compare-composition.schema': compareCompositionJsonSchema,
  'timeline.schema': timelineJsonSchema,
  'plan.schema': planJsonSchema,
}))
  await writeFile(
    `${output}/${name}.json`,
    JSON.stringify(data, null, 2) + '\n',
  );
await writeFile(
  `${output}/capabilities.md`,
  '# Repro capability reference\n\nGenerated from the authoritative registry. Run `repro doctor` for local availability.\n\n' +
    capabilities
      .map(
        (c) =>
          `## ${c.id}: ${c.title}\n\n${c.description}\n\nStatus: ${c.status}\n\n\`${c.invocation}\`\n\nInputs: ${c.inputs.join(', ') || 'none'}. Outputs: ${c.outputs.join(', ')}.\n\nPrerequisites: ${c.prerequisites.join(', ') || 'none'}.\n\nTiming: ${c.timingEffects}\n\nPrivacy: ${c.privacy}\n\nVerification: ${c.verification}\n\nFailures: ${c.failureModes.join('; ')}\n`,
      )
      .join('\n'),
);
