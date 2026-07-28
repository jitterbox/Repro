import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ReproConfig } from '@repro/core';

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

export interface AnnotationHint {
  readonly target: string;
  readonly shape: 'rect' | 'ellipse' | 'underline' | 'path';
  readonly label: string;
}

export interface BugWorkItem {
  readonly id: string;
  readonly 'System.Title': string;
  readonly 'System.State': string;
  readonly 'System.WorkItemType': string;
  readonly 'Microsoft.VSTS.TCM.ReproSteps': string;
  readonly 'Custom.Selectors': Readonly<Record<string, string>>;
  readonly 'Custom.AnnotationHints': readonly AnnotationHint[];
  readonly 'Custom.ReproConfig': ReproConfig;
  readonly 'Custom.Tags': readonly string[];
  readonly 'Custom.Severity': string;
}

export interface BugIndexEntry {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly tags: readonly string[];
  readonly path: string;
}

export function getRepoRoot(): string {
  return repoRoot;
}

export async function loadBugIndex(): Promise<readonly BugIndexEntry[]> {
  const raw = JSON.parse(
    await readFile(join(repoRoot, 'testdata/bugs/index.json'), 'utf8'),
  ) as { bugs: BugIndexEntry[] };
  return raw.bugs;
}

export async function loadBug(id: string): Promise<BugWorkItem> {
  const path = join(repoRoot, 'testdata/bugs', `${id}.json`);
  return JSON.parse(await readFile(path, 'utf8')) as BugWorkItem;
}

export function testId(bug: BugWorkItem, key: string): string {
  const value = bug['Custom.Selectors'][key];
  if (value === undefined) {
    throw new Error(`Bug ${bug.id} missing selector ${key}`);
  }
  return `[data-testid="${value}"]`;
}
