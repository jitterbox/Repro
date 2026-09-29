import { it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importJiraIssue, jiraText, jiraSections } from './jira-import.js';
it('preserves structured Jira text and hashes ticket media without claiming browser evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'jira-intake-'));
  try {
    await writeFile(join(root, 'clip.webm'), 'fixture media');
    await writeFile(
      join(root, 'issue.json'),
      JSON.stringify({
        key: 'QA-14',
        fields: {
          summary: 'Gallery stuck',
          description: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ text: 'Swipe the photo.' }] },
            ],
          },
          attachment: [
            { id: '14', filename: 'clip.webm', mimeType: 'video/webm' },
          ],
        },
      }),
    );
    const result = await importJiraIssue(join(root, 'issue.json'), {
      outDir: join(root, 'out'),
      attachmentsDir: root,
    });
    const brief = JSON.parse(await readFile(result.output, 'utf8')) as {
      description: string;
      attachments: { sha256: string; provenance: string }[];
    };
    expect(brief.description).toBe('Swipe the photo.');
    expect(brief.attachments[0]?.sha256).toHaveLength(64);
    expect(brief.attachments[0]?.provenance).toBe('ticket-context');
    expect(result.requiresCapture).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('treats scripts as text', () => {
  expect(
    jiraText({
      type: 'paragraph',
      content: [{ text: '<script>untrusted</script>' }],
    }),
  ).toBe('<script>untrusted</script>');
});

it('extracts explicit reproduction and outcome headings without interpreting unlabelled prose', () => {
  expect(
    jiraSections(
      'Steps to reproduce:\n1. Open the report\n2. Toggle dark mode\nExpected: dark green surface\nActual: pale green surface',
    ),
  ).toEqual({
    steps: ['Open the report', 'Toggle dark mode'],
    expected: 'dark green surface',
    actual: 'pale green surface',
  });
  expect(jiraSections('A ticket with no structured headings')).toEqual({
    steps: [],
    expected: '',
    actual: '',
  });
});

it('keeps inline rich-text fragments in one instruction', () =>
  { expect(
    jiraText({
      type: 'paragraph',
      content: [
        { text: 'Click ' },
        { text: 'Open', marks: [{ type: 'strong' }] },
      ],
    }),
  ).toBe('Click Open'); });
