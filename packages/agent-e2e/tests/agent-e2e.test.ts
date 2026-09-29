import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { loadBug } from '@jitterbox/repro-e2e-fixture';

import { expectedFiledFeatures } from '../src/bug-drivers.js';
import { runAgent, runMockAgent } from '../src/run-agent.js';

describe('agent-e2e mock agent', () => {
  it('runs BUG-1001 compare workflow with filed features', async () => {
    const bug = await loadBug('BUG-1001');
    const expected = expectedFiledFeatures(bug);
    const { runDir, transcript } = await runMockAgent({ bugId: bug.id });

    expect(transcript.bugId).toBe('BUG-1001');
    expect(transcript.agent).toBe('mock');
    expect(transcript.config.features.specCard).toBe(expected.specCard);
    expect(transcript.config.features.steps).toBe(expected.steps);
    expect(transcript.config.features.zoom).toBe(true);
    expect(transcript.config.mode).toBe('compare');
    expect(
      transcript.steps.some((step) => step.tool === 'validate-config'),
    ).toBe(true);
    expect(transcript.steps.some((step) => step.tool === 'capture')).toBe(true);
    expect(transcript.steps.some((step) => step.tool === 'compare')).toBe(true);
    expect(
      transcript.steps.some((step) => step.tool === 'render-compare'),
    ).toBe(true);

    await access(join(runDir, 'repro.config.json'));
    await access(transcript.artifacts.transcriptPath);
    await access(transcript.artifacts.configPath);
  }, 300_000);

  it('runs BUG-1008 repro workflow with filed features', async () => {
    const bug = await loadBug('BUG-1008');
    const expected = expectedFiledFeatures(bug);
    const { runDir, transcript } = await runMockAgent({ bugId: bug.id });

    expect(transcript.bugId).toBe('BUG-1008');
    expect(transcript.config.features.specCard).toBe(expected.specCard);
    expect(transcript.config.features.steps).toBe(expected.steps);
    expect(transcript.config.features.consoleOverlay).toBe(true);
    expect(transcript.config.mode).toBe('repro');
    expect(transcript.steps.every((step) => step.ok)).toBe(true);
    expect(transcript.artifacts.annotatedVideoPath).toBeDefined();

    await access(join(runDir, 'repro.config.json'));
    await access(transcript.artifacts.transcriptPath);
  }, 300_000);

  it('never substitutes a mock for a requested live evaluation', async () => {
    vi.stubEnv('REPRO_AGENT_E2E', '1');
    try {
      await expect(runAgent({ bugId: 'not-a-fixture' })).rejects.toThrow(
        'No mock was run',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
