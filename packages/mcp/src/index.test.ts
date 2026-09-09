import { expect, it, vi } from 'vitest';
import type * as Pipeline from '@repro/pipeline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { capabilities } from '@repro/contracts';
const calls = vi.hoisted(() => ({
  render: vi.fn(() => Promise.resolve({ ok: true })),
  export: vi.fn(() => Promise.resolve({ ok: true })),
}));
vi.mock('@repro/pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof Pipeline>()),
  renderEvidence: calls.render,
  exportEvidence: calls.export,
}));
import { createReproMcpServer } from './index.js';

it('discovers authoritative guidance and forwards revised presentations and paired exports through MCP', async () => {
  const server = createReproMcpServer();
  const client = new Client({ name: 'guidance-acceptance', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const id =
        tool.name === 'validate_evidence' ? 'validate-evidence' : tool.name;
      expect(tool.description).toBe(
        capabilities.find((c) => c.id === id)?.description,
      );
    }
    const run = tools.find((tool) => tool.name === 'run');
    expect(Object.keys(run?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['project', 'buildId', 'config', 'repeat']),
    );
    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining([
        'repro://discovery-guide',
        'repro://bug-brief-schema',
        'repro://discovery-assessment-schema',
        'repro://config-schema',
        'repro://plan-schema',
        'repro://timeline-schema',
        'repro://quality-result-schema',
        'repro://compare-composition-schema',
        'repro://capability-schema',
        'repro://share-report-schema',
      ]),
    );
    const discovery = await client.callTool({
      name: 'discover',
      arguments: {
        bug: { title: 'A button does nothing', steps: ['Click the button'] },
      },
    });
    expect(discovery.isError).not.toBe(true);
    expect(JSON.stringify(discovery.content)).toContain('needs-assessment');
    const guide = await client.readResource({ uri: 'repro://discovery-guide' });
    expect(JSON.stringify(guide.contents)).toContain('hit-test');
    const recipes = await client.callTool({ name: 'recipes', arguments: {} });
    expect(recipes.isError).not.toBe(true);
    await client.callTool({
      name: 'render',
      arguments: { run: '/run', evidence: '/revised.json' },
    });
    expect(calls.render).toHaveBeenCalledWith('/run', {
      evidence: '/revised.json',
    });
    await client.callTool({
      name: 'export',
      arguments: { run: '/after', outDir: '/bundle', baseline: '/before' },
    });
    expect(calls.export).toHaveBeenCalledWith('/after', '/bundle', '/before');
  } finally {
    await client.close();
    await server.close();
  }
});
