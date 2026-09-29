import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { basename, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { bugBriefSchema } from '@repro/contracts';

const issueSchema = z.object({
  key: z.string(),
  self: z.url().optional(),
  fields: z.object({
    summary: z.string(),
    description: z.unknown().optional(),
    attachment: z
      .array(
        z.object({
          id: z.string(),
          filename: z.string(),
          mimeType: z.string(),
          content: z.url().optional(),
        }),
      )
      .default([]),
  }),
});
/** Atlassian document text is data, never evaluated as HTML or agent instructions. */
export function jiraText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const node = value as { text?: unknown; type?: unknown; content?: unknown };
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hardBreak') return '\n';
  if (!Array.isArray(node.content)) return '';
  return node.content
    .map(jiraText)
    .join(
      ['doc', 'bulletList', 'orderedList', 'listItem'].includes(
        String(node.type),
      )
        ? '\n'
        : '',
    )
    .trim();
}
/** Extract only explicitly headed ticket sections; leave ambiguous narrative as description. */
export function jiraSections(description: unknown) {
  const lines = jiraText(description).split(/\n+/),
    steps: string[] = [];
  let section = '',
    expected = '',
    actual = '';
  for (const line of lines) {
    const heading =
      /^(steps to reproduce|reproduction steps|expected(?: result| behavior)?|actual(?: result| behavior)?)[ :]*(.*)$/i.exec(
        line.trim(),
      );
    if (heading) {
      const label = (heading[1] ?? '').toLowerCase();
      section = label.startsWith('expected')
        ? 'expected'
        : label.startsWith('actual')
          ? 'actual'
          : 'steps';
      const text = heading[2] ?? '';
      if (section === 'expected') expected = text;
      else if (section === 'actual') actual = text;
      else if (text) steps.push(text);
      continue;
    }
    if (section === 'steps') steps.push(line.replace(/^\s*\d+[.)]\s*/, ''));
    if (section === 'expected') expected += (expected ? '\n' : '') + line;
    if (section === 'actual') actual += (actual ? '\n' : '') + line;
  }
  return { steps, expected, actual };
}
/** Import a saved Jira issue plus locally downloaded attachments, retaining their source identity. */
export async function importJiraIssue(
  file: string,
  options: { outDir: string; attachmentsDir?: string },
) {
  const bytes = await readFile(file),
    issue = issueSchema.parse(JSON.parse(bytes.toString('utf8')));
  const destination = resolve(options.outDir);
  await mkdir(destination, { recursive: true });
  const attachments = [];
  for (const attachment of issue.fields.attachment) {
    if (!options.attachmentsDir)
      throw new Error(
        'Jira attachments require --attachments-dir; missing ticket media must not be silently discarded',
      );
    if (basename(attachment.filename) !== attachment.filename)
      throw new Error('Unsafe Jira attachment filename');
    const root = await realpath(options.attachmentsDir),
      source = await realpath(join(root, attachment.filename));
    if (relative(root, source).startsWith('..'))
      throw new Error('Attachment leaves the supplied directory');
    const data = await readFile(source);
    if (data.length > 64 * 1024 * 1024)
      throw new Error('Jira attachment exceeds 64 MiB import limit');
    const sha256 = createHash('sha256').update(data).digest('hex'),
      name = `${sha256}-${attachment.filename}`;
    await writeFile(join(destination, name), data, { mode: 0o600 });
    attachments.push({
      id: attachment.id,
      name: attachment.filename,
      mediaType: attachment.mimeType,
      path: name,
      sha256,
      source: attachment.content ?? issue.self ?? issue.key,
      provenance: 'ticket-context' as const,
      restricted: true as const,
    });
  }
  const brief = bugBriefSchema.parse({
    id: issue.key,
    title: issue.fields.summary,
    description: jiraText(issue.fields.description),
    ...jiraSections(issue.fields.description),
    attachments,
    provenance: {
      source: issue.self ?? issue.key,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      kind: 'jira',
    },
  });
  const output = join(destination, 'bug-brief.json');
  await writeFile(output, JSON.stringify(brief, null, 2), { mode: 0o600 });
  return {
    output,
    attachmentCount: attachments.length,
    provenance: 'ticket-context',
    requiresCapture: true,
  };
}
