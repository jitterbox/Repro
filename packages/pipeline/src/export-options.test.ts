import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { artifactBaseName } from '@repro/core';
import { expect, it, vi } from 'vitest';
import type { RunManifest } from '@repro/contracts';
import type * as Render from '@repro/render';
const state = vi.hoisted(() => ({
  run: {} as RunManifest,
  diagnostics: vi.fn(() => Promise.resolve({ kind: 'repro-devtools' })),
  package: vi.fn((value: unknown) => Promise.resolve(value)),
}));
vi.mock('./evidence-run.js', () => ({
  verifyRun: () => Promise.resolve(state.run),
}));
vi.mock('./recording-duration.js', () => ({
  recordingDurationMs: () => Promise.resolve(1000),
}));
vi.mock('./commands/package.js', () => ({ packageCommand: state.package }));
vi.mock('./devtools-export.js', () => ({
  buildDevToolsReport: state.diagnostics,
}));
vi.mock('@repro/render', async (original) => ({
  ...(await original<typeof Render>()),
  probeMediaDurationMs: () => Promise.resolve(1000),
}));
import { exportEvidence } from './export.js';
import { recipes } from './discovery.js';

it('defaults diagnostics on, resolves CLI over config over stored config, and names all exported evidence consistently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-export-options-'));
  const config = {
    mode: 'repro',
    profile: 'controlled',
    surfaceCapture: 'page',
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    workItem: 'DASH2R-949',
  };
  try {
    await writeFile(
      join(directory, 'evidence.json'),
      JSON.stringify(recipes[0]),
    );
    await writeFile(
      join(directory, 'plan.json'),
      JSON.stringify({
        annotations: [],
        redactionRects: [],
        metadata: {},
        timeline: {},
      }),
    );
    state.run = {
      pipelineOutcome: 'passed',
      scenarioOutcome: 'bug-reproduced',
      variant: { id: 'before', label: 'Before', role: 'before' },
      environment: { appliedConfiguration: config },
      stages: { presentation: { status: 'passed' } },
      artifacts: [
        { kind: 'presentation-video', path: 'proof.mp4' },
        { kind: 'presentation-image', path: 'result.png' },
        { kind: 'presentation-key:test', path: 'plan.json' },
      ],
    } as unknown as RunManifest;
    await exportEvidence(directory, 'bundle');
    expect(state.package.mock.lastCall?.[0]).toMatchObject({
      workItem: 'DASH2R-949',
      assets: [
        { fileName: 'DASH2R-949_before_repro.mp4' },
        { fileName: 'DASH2R-949_before_checkpoint-result.png' },
      ],
      devtools: [{ fileName: 'DASH2R-949_before_devtools.json' }],
    });
    state.run.environment.appliedConfiguration = {
      ...config,
      export: { devtools: false },
    };
    state.diagnostics.mockClear();
    await exportEvidence(directory, 'bundle');
    expect(state.diagnostics).not.toHaveBeenCalled();
    expect(state.package.mock.lastCall?.[0]).toMatchObject({ devtools: [] });
    await exportEvidence(directory, 'bundle', undefined, false, {
      devtools: true,
      workItem: 'Mobile / overflow',
    });
    expect(state.package.mock.lastCall?.[0]).toMatchObject({
      assets: [
        { fileName: 'Mobile-overflow_before_repro.mp4' },
        { fileName: 'Mobile-overflow_before_checkpoint-result.png' },
      ],
      devtools: [{ fileName: 'Mobile-overflow_before_devtools.json' }],
    });
    delete state.run.environment.appliedConfiguration;
    await exportEvidence(directory, 'bundle');
    expect(state.package.mock.lastCall?.[0]).toMatchObject({
      workItem: recipes[0]?.title,
      devtools: [
        {
          fileName: `${artifactBaseName({ description: recipes[0]?.title ?? '', scenarioId: recipes[0]?.id ?? '' })}_before_devtools.json`,
        },
      ],
    });
    const file = join(directory, 'override.json');
    await writeFile(
      file,
      JSON.stringify({
        ...config,
        naming: { useWorkItemId: false },
        export: { devtools: true },
      }),
    );
    await exportEvidence(directory, 'bundle', undefined, false, {
      config: file,
      devtools: false,
    });
    expect(state.package.mock.lastCall?.[0]).toMatchObject({
      workItem: recipes[0]?.title,
      devtools: [],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
