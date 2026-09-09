import { watchServerSchema } from '@repro/contracts';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import {
  discoverBug,
  discoveryGuide,
  capabilities,
  describeCapability,
  recipes,
  doctor,
  validateEvidence,
  runScenario,
  summarizeRunResult,
  inspectFrame,
  verifyRun,
  compareEvidence,
  exportEvidence,
  renderEvidence,
} from '@repro/pipeline';
import {
  bugBriefJsonSchema,
  discoveryAssessmentJsonSchema,
  evidenceJsonSchema,
  runJsonSchema,
  configJsonSchema,
  compareCompositionJsonSchema,
  timelineJsonSchema,
  planJsonSchema,
  qualityResultSchema,
  capabilitySchema,
  shareReportSchema,
} from '@repro/contracts';
const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});
export function createReproMcpServer() {
  const server = new McpServer({ name: 'repro', version: '0.1.0' });
  server.registerTool(
    'discover',
    {
      description: describeCapability('discover').description,
      inputSchema: { bug: z.unknown(), assessment: z.unknown().optional() },
    },
    ({ bug, assessment }) => json(discoverBug(bug, assessment)),
  );
  server.registerTool(
    'capabilities',
    {
      description: describeCapability('capabilities').description,
      inputSchema: {},
    },
    () => json(capabilities),
  );
  server.registerTool(
    'describe',
    {
      description: describeCapability('describe').description,
      inputSchema: { id: z.string() },
    },
    ({ id }) => json(describeCapability(id)),
  );
  server.registerTool(
    'doctor',
    {
      description: describeCapability('doctor').description,
      inputSchema: {},
    },
    async () => json(await doctor()),
  );
  server.registerTool(
    'validate_evidence',
    {
      description: describeCapability('validate-evidence').description,
      inputSchema: { spec: z.unknown() },
    },
    ({ spec }) => json(validateEvidence(spec)),
  );
  server.registerTool(
    'run',
    {
      description: describeCapability('run').description,
      inputSchema: {
        spec: z.string(),
        evidence: z.string(),
        url: z.string().optional(),
        playwrightConfig: z.string().optional(),
        config: z.string().optional(),
        project: z.string().optional(),
        buildId: z.string().optional(),
        repeat: z.number().int().positive().optional(),
        baseline: z.string().optional(),
        outDir: z.string().optional(),
      },
    },
    async (options) => json(summarizeRunResult(await runScenario(options))),
  );
  server.registerTool(
    'frame',
    {
      description: describeCapability('frame').description,
      inputSchema: {
        run: z.string(),
        checkpoint: z.string().optional(),
        timeMs: z.number().optional(),
        target: z.string().optional(),
      },
    },
    async ({ run, ...selection }) => {
      const frame = await inspectFrame(run, selection);
      return {
        content: [
          ...json(frame).content,
          {
            type: 'image' as const,
            data: (await readFile(frame.crop ?? frame.context)).toString(
              'base64',
            ),
            mimeType: 'image/png',
          },
        ],
      };
    },
  );
  server.registerTool(
    'status',
    {
      description: describeCapability('status').description,
      inputSchema: { run: z.string() },
    },
    async ({ run }) => json(await verifyRun(run)),
  );
  server.registerTool(
    'compare',
    {
      description: describeCapability('compare').description,
      inputSchema: { before: z.string(), after: z.string() },
    },
    async ({ before, after }) => json(await compareEvidence(before, after)),
  );
  server.registerTool(
    'render',
    {
      description: describeCapability('render').description,
      inputSchema: { run: z.string(), evidence: z.string().optional() },
    },
    async ({ run, evidence }) =>
      json(await renderEvidence(run, evidence ? { evidence } : {})),
  );
  server.registerTool(
    'export',
    {
      description: describeCapability('export').description,
      inputSchema: {
        run: z.string(),
        outDir: z.string(),
        baseline: z.string().optional(),
      },
    },
    async ({ run, outDir, baseline }) =>
      json(await exportEvidence(run, outDir, baseline)),
  );
  server.registerTool(
    'recipes',
    { description: describeCapability('recipes').description, inputSchema: {} },
    () => json(recipes),
  );
  for (const [name, value] of Object.entries({
    capabilities,
    recipes,
    'discovery-guide': discoveryGuide(),
    'bug-brief-schema': bugBriefJsonSchema,
    'discovery-assessment-schema': discoveryAssessmentJsonSchema,
    'evidence-schema': evidenceJsonSchema,
    'run-schema': runJsonSchema,
    'config-schema': configJsonSchema,
    'watch-server-schema': z.toJSONSchema(watchServerSchema),
    'compare-composition-schema': compareCompositionJsonSchema,
    'timeline-schema': timelineJsonSchema,
    'plan-schema': planJsonSchema,
    'quality-result-schema': z.toJSONSchema(qualityResultSchema),
    'capability-schema': z.toJSONSchema(capabilitySchema),
    'share-report-schema': z.toJSONSchema(shareReportSchema),
  })) {
    const uri = `repro://${name}`;
    server.registerResource(
      name,
      uri,
      {
        mimeType: 'application/json',
        description: `Authoritative Repro ${name}`,
      },
      () => ({
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(value, null, 2),
          },
        ],
      }),
    );
  }
  return server;
}
