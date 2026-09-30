import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  configFromBug,
  loadBug,
  runScenarioAnnotate,
  runScenarioCapture,
  withServer,
} from '@jitterbox/repro-e2e-fixture';
import { buildQualityReport, metricStatus } from '@jitterbox/repro-evaluation';

import { createReproCliTools, recordStep } from './cli-tools.js';
import { bugCaptureDriver, compareManifestForBug } from './bug-drivers.js';

import type {
  AgentTranscript,
  RunAgentInput,
  RunAgentResult,
  TranscriptStep,
} from './types.js';

interface MutableArtifacts {
  configPath: string;
  transcriptPath: string;
  captureDir?: string;
  eventsPath?: string;
  videoPath?: string;
  planPath?: string;
  annotatedVideoPath?: string;
  compareResultPath?: string;
  qualityReportPath?: string;
}

export async function runMockAgent(
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const bug = await loadBug(input.bugId);
  const config = configFromBug(bug);
  const runDir =
    input.runDir ??
    join(repoRoot, '.repro/agent-runs', bug.id, timestampSlug());
  await mkdir(runDir, { recursive: true });

  const configPath = join(runDir, 'repro.config.json');
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const tools = createReproCliTools();
  const steps: TranscriptStep[] = [];
  const artifacts: MutableArtifacts = {
    configPath,
    transcriptPath: join(runDir, 'transcript.json'),
  };
  const startedAt = new Date().toISOString();

  const validation = await runStep(
    steps,
    'validate-config',
    { configPath },
    () => tools.validateConfig(configPath),
  );
  if (!validation.validation.ok) {
    return finalize({
      agent: 'mock',
      artifacts,
      bugId: bug.id,
      config,
      runDir,
      startedAt,
      steps,
    });
  }

  const captureRoot = join(runDir, 'run');
  await mkdir(captureRoot, { recursive: true });

  if (config.mode === 'compare') {
    await runCompareBugFlow({
      artifacts,
      bugId: bug.id,
      captureRoot,
      configPath,
      runDir,
      steps,
      tools,
    });
  } else {
    await runReproBugFlow({
      artifacts,
      bugId: bug.id,
      captureRoot,
      configPath,
      steps,
      tools,
    });
  }

  const qualityPath = join(runDir, 'quality-report.json');
  await runStep(
    steps,
    'quality',
    { input: qualityPath, out: qualityPath },
    async () => {
      const report = buildQualityReport({
        completed: true,
        metrics: [
          {
            name: 'determinism',
            required: true,
            status: metricStatus(1, 1, 'at-least'),
            threshold: 1,
            value: 1,
          },
          {
            name: 'redaction-leakage',
            required: true,
            status: metricStatus(0, 0, 'at-most'),
            threshold: 0,
            value: 0,
          },
        ],
      });
      await writeFile(qualityPath, `${JSON.stringify(report, null, 2)}\n`);
      artifacts.qualityReportPath = qualityPath;
      return report;
    },
  );

  return finalize({
    agent: 'mock',
    artifacts,
    bugId: bug.id,
    config,
    runDir,
    startedAt,
    steps,
  });
}

async function runReproBugFlow(input: {
  readonly artifacts: MutableArtifacts;
  readonly bugId: string;
  readonly captureRoot: string;
  readonly configPath: string;
  readonly steps: TranscriptStep[];
  readonly tools: ReturnType<typeof createReproCliTools>;
}): Promise<void> {
  const driver = bugCaptureDriver(input.bugId);

  await withServer(async (server) => {
    const captureDir = join(input.captureRoot, 'broken');
    const capture = await runStep(
      input.steps,
      'run',
      {
        configPath: input.configPath,
        fixture: 'broken',
        outDir: captureDir,
        url: server.fixtureUrl('broken'),
      },
      async () => {
        const result = await runScenarioCapture({
          config: (await loadBug(input.bugId))['Custom.ReproConfig'],
          drive: driver,
          fixture: 'broken',
          scenario: `agent-${input.bugId}`,
          server,
        });
        input.artifacts.captureDir = result.captureDir;
        input.artifacts.eventsPath = result.eventsPath;
        input.artifacts.videoPath = result.videoPath;
        return result;
      },
    );

    const renderDir = join(input.captureRoot, 'render');
    const annotated = await runStep(
      input.steps,
      'render',
      {
        configPath: input.configPath,
        events: capture.eventsPath,
        outDir: renderDir,
        video: capture.videoPath,
      },
      async () => {
        const result = await input.tools.annotate({
          config: input.configPath,
          events: capture.eventsPath,
          outDir: renderDir,
          video: capture.videoPath,
        });
        input.artifacts.planPath = result.planPath;
        input.artifacts.annotatedVideoPath = result.render.outputPath;
        return result;
      },
    );
    void annotated;
  });
}

async function runCompareBugFlow(input: {
  readonly artifacts: MutableArtifacts;
  readonly bugId: string;
  readonly captureRoot: string;
  readonly configPath: string;
  readonly runDir: string;
  readonly steps: TranscriptStep[];
  readonly tools: ReturnType<typeof createReproCliTools>;
}): Promise<void> {
  const bug = await loadBug(input.bugId);
  const config = configFromBug(bug);
  const driver = bugCaptureDriver(input.bugId);

  await withServer(async (server) => {
    const broken = await runScenarioCapture({
      config,
      drive: driver,
      fixture: 'broken',
      runId: `${input.bugId}-broken`,
      scenario: `agent-${input.bugId}`,
      server,
    });
    const fixed = await runScenarioCapture({
      config,
      drive: driver,
      fixture: 'fixed',
      runId: `${input.bugId}-fixed`,
      scenario: `agent-${input.bugId}`,
      server,
    });

    await runStep(
      input.steps,
      'run',
      {
        broken: broken.captureDir,
        configPath: input.configPath,
        fixed: fixed.captureDir,
      },
      () => Promise.resolve({ broken, fixed }),
    );

    input.artifacts.captureDir = broken.captureDir;
    input.artifacts.eventsPath = broken.eventsPath;
    input.artifacts.videoPath = broken.videoPath;

    const brokenRender = join(input.captureRoot, 'render-broken');
    const fixedRender = join(input.captureRoot, 'render-fixed');
    await runScenarioAnnotate({
      config,
      eventsPath: broken.eventsPath,
      scenario: `agent-${input.bugId}`,
      suffix: 'render-broken',
      videoPath: broken.videoPath,
    });
    await runScenarioAnnotate({
      config,
      eventsPath: fixed.eventsPath,
      scenario: `agent-${input.bugId}`,
      suffix: 'render-fixed',
      videoPath: fixed.videoPath,
    });

    const leftPath = join(input.runDir, 'compare-left.json');
    const rightPath = join(input.runDir, 'compare-right.json');
    const left = compareManifestForBug(input.bugId, 'broken');
    const right = compareManifestForBug(input.bugId, 'fixed');
    await writeFile(leftPath, `${JSON.stringify(left, null, 2)}\n`);
    await writeFile(rightPath, `${JSON.stringify(right, null, 2)}\n`);

    const compareOut = join(input.runDir, 'compare-result.json');
    const compareResult = await runStep(
      input.steps,
      'compare',
      { left: leftPath, out: compareOut, right: rightPath },
      async () => {
        const result = await input.tools.compare({
          left: leftPath,
          out: compareOut,
          right: rightPath,
        });
        input.artifacts.compareResultPath = compareOut;
        return result;
      },
    );

    const compositionPath = join(input.runDir, 'compare-composition.json');
    const composition =
      (compareResult as { composition?: unknown }).composition ?? compareResult;
    await writeFile(
      compositionPath,
      `${JSON.stringify(composition, null, 2)}\n`,
    );

    await runStep(
      input.steps,
      'render',
      {
        composition: compositionPath,
        outDir: join(input.runDir, 'compare-render'),
        videoA: broken.videoPath,
        videoB: fixed.videoPath,
      },
      async () => {
        const rendered = await input.tools.renderCompare({
          composition: compositionPath,
          outDir: join(input.runDir, 'compare-render'),
          videoA: broken.videoPath,
          videoB: fixed.videoPath,
        });
        input.artifacts.annotatedVideoPath = rendered.outputPath;
        return rendered;
      },
    );

    input.artifacts.planPath = join(brokenRender, 'plan.json');
    void fixedRender;
  });
}

async function runStep<T>(
  steps: TranscriptStep[],
  tool: TranscriptStep['tool'],
  stepInput: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const { result, step } = await recordStep(tool, stepInput, run);
    steps.push(step);
    return result;
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'step' in error) {
      steps.push((error as { step: TranscriptStep }).step);
    }
    throw error;
  }
}

async function finalize(input: {
  readonly agent: AgentTranscript['agent'];
  readonly artifacts: MutableArtifacts;
  readonly bugId: string;
  readonly config: AgentTranscript['config'];
  readonly runDir: string;
  readonly startedAt: string;
  readonly steps: readonly TranscriptStep[];
}): Promise<RunAgentResult> {
  const transcript: AgentTranscript = {
    agent: input.agent,
    artifacts: input.artifacts,
    bugId: input.bugId,
    completedAt: new Date().toISOString(),
    config: input.config,
    runDir: input.runDir,
    startedAt: input.startedAt,
    steps: input.steps,
  };

  await writeFile(
    input.artifacts.transcriptPath,
    `${JSON.stringify(transcript, null, 2)}\n`,
  );

  return { runDir: input.runDir, transcript };
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/gu, '-');
}
