import type { ReproConfig } from '@repro/core';

export type ReproCliVerb =
  | 'validate-config'
  | 'capture'
  | 'annotate'
  | 'compare'
  | 'render-compare'
  | 'quality';

export interface AgentRunArtifacts {
  readonly configPath: string;
  readonly captureDir?: string;
  readonly eventsPath?: string;
  readonly videoPath?: string;
  readonly planPath?: string;
  readonly annotatedVideoPath?: string;
  readonly compareResultPath?: string;
  readonly qualityReportPath?: string;
  readonly transcriptPath: string;
}

export interface TranscriptStep {
  readonly tool: ReproCliVerb;
  readonly ok: boolean;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly input: Record<string, unknown>;
  readonly output?: unknown;
  readonly error?: string;
}

export interface AgentTranscript {
  readonly bugId: string;
  readonly agent: 'mock' | 'anthropic' | 'cursor';
  readonly startedAt: string;
  readonly completedAt: string;
  readonly runDir: string;
  readonly config: ReproConfig;
  readonly artifacts: AgentRunArtifacts;
  readonly steps: readonly TranscriptStep[];
}

export interface RunAgentInput {
  readonly bugId: string;
  readonly repoRoot?: string;
  readonly runDir?: string;
}

export interface RunAgentResult {
  readonly transcript: AgentTranscript;
  readonly runDir: string;
}

export interface BugDriverContext {
  readonly bugId: string;
  readonly fixture: 'broken' | 'fixed';
  readonly captureDir: string;
  readonly serverUrl: string;
}

export interface CaptureDriver {
  (
    ctx: BugDriverContext,
  ): Promise<{
    readonly eventsPath: string;
    readonly videoPath: string;
    readonly captureDir: string;
  }>;
}
