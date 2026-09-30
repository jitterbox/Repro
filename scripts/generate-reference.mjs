import { pathToFileURL } from 'node:url';
/** Public references are generated from the installed CLI and MCP protocol, not a second option list. */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createReproProgram } from '../packages/cli/dist/index.js';
import { createReproMcpServer } from '../packages/mcp/dist/index.js';
const require = createRequire(
  new URL('../packages/mcp/package.json', import.meta.url),
);
const { Client } = await import(
  pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js'))
    .href
);
const { InMemoryTransport } = await import(
  pathToFileURL(require.resolve('@modelcontextprotocol/sdk/inMemory.js')).href
);
const output = new URL('../docs/reference/', import.meta.url);
await mkdir(new URL('schemas/', output), { recursive: true });
async function save(name, text) {
  const path = new URL(name, output);
  if (process.argv.includes('--check')) {
    if ((await readFile(path, 'utf8')) !== text)
      throw new Error(`Stale docs/reference/${name}; run pnpm docs:generate`);
  } else await writeFile(path, text);
}
const commands = [];
function walk(command, parents = []) {
  const name = [...parents, command.name()].join(' ');
  commands.push(
    `## ${name}\n\n\`\`\`text\n${command.helpInformation().trim()}\n\`\`\`\n`,
  );
  for (const child of command.commands)
    walk(child, [...parents, command.name()]);
}
walk(createReproProgram());
await save(
  'cli.md',
  '# CLI reference\n\nGenerated from Commander. Every command, argument, option and CLI default is listed below. See [workflows](../ai-usage.md) for evidence semantics and [configuration](../configuration.md) for JSON file settings.\n\n' +
    commands.join('\n'),
);
const server = createReproMcpServer();
const client = new Client({ name: 'repro-docs', version: '0.3.0' });
const [a, b] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(a);
  await client.connect(b);
  const { tools } = await client.listTools();
  const { resources } = await client.listResources();
  await save(
    'mcp.md',
    '# MCP reference\n\nGenerated from the live stdio server implementation. Register `repro-mcp` with your harness; [installation](../installation.md#mcp) includes an example. JSON schemas below are authoritative for every input. CLI and MCP share the same pipeline, but not every low-level CLI verb is an MCP tool.\n\n' +
      tools
        .map(
          (t) =>
            `## ${t.name}\n\n${t.description}\n\n\`\`\`json\n${JSON.stringify(t.inputSchema, null, 2)}\n\`\`\`\n`,
        )
        .join('\n') +
      '\n## Resources\n\n' +
      resources.map((r) => `- \`${r.uri}\`: ${r.description}`).join('\n') +
      '\n',
  );
  const names = [];
  for (const resource of resources) {
    if (!resource.name.endsWith('schema')) continue;
    const value = await client.readResource({ uri: resource.uri });
    const text = value.contents[0].text;
    const name = `${resource.name}.json`;
    await save(
      `schemas/${name}`,
      JSON.stringify(JSON.parse(text), null, 2) + '\n',
    );
    names.push(`- [${resource.name}](schemas/${name})`);
  }
  await save(
    'schemas.md',
    '# All configuration and artifact schemas\n\nGenerated from MCP resources. Each schema enumerates nested fields, types, required fields, ranges, enumerations and defaults. Omitted fields receive their documented defaults; unknown treatment fields are rejected.\n\n' +
      names.join('\n') +
      '\n',
  );
} finally {
  await client.close();
  await server.close();
}
