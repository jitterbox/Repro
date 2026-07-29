import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runDeterministicGates } from './index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTROLS_DIR = join(HERE, '../../../../testdata/negative-controls');

interface NegativeControl {
  readonly expectedFailures?: readonly string[];
  readonly mode?: 'repro' | 'demo' | 'compare';
  readonly bugId?: string;
  readonly strictRedaction?: boolean;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly plan?: unknown;
  readonly timeline?: unknown;
  readonly filename?: string;
}

describe('negative-controls corpus', () => {
  it('fails the named gates for each plan-backed control', async () => {
    const files = (await readdir(CONTROLS_DIR)).filter((name) =>
      name.endsWith('.json'),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const control = JSON.parse(
        await readFile(join(CONTROLS_DIR, file), 'utf8'),
      ) as NegativeControl;
      const expected = control.expectedFailures ?? [];
      if (
        expected.length === 0 ||
        (control.plan === undefined && control.timeline === undefined)
      ) {
        continue;
      }

      const dir = await mkdtemp(join(tmpdir(), 'repro-neg-'));
      let planPath: string | undefined;
      if (control.plan !== undefined) {
        planPath = join(dir, 'plan.json');
        await writeFile(planPath, `${JSON.stringify(control.plan)}\n`);
      }
      let timelinePath: string | undefined;
      if (control.timeline !== undefined) {
        timelinePath = join(dir, 'timeline.json');
        await writeFile(timelinePath, `${JSON.stringify(control.timeline)}\n`);
      }

      const gated = await runDeterministicGates({
        ...(planPath === undefined ? {} : { planPath }),
        ...(timelinePath === undefined ? {} : { timelinePath }),
        mode: control.mode ?? 'repro',
        ...(control.bugId === undefined ? {} : { bugId: control.bugId }),
        ...(control.strictRedaction === undefined
          ? {}
          : { strictRedaction: control.strictRedaction }),
        ...(control.filename === undefined
          ? {}
          : { filename: control.filename }),
        frameWidth: control.frameWidth ?? 1280,
        frameHeight: control.frameHeight ?? 720,
      });

      for (const name of expected) {
        const gate = gated.results.find((entry) => entry.name === name);
        expect(gate, `${file} missing gate ${name}`).toBeDefined();
        expect(gate?.pass, `${file} expected ${name} to fail`).toBe(false);
      }
    }
  });
});
