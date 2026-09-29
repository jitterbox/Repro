import { runMockAgent } from './mock-agent.js';

import type { RunAgentInput, RunAgentResult } from './types.js';

export interface LiveAgentEnv {
  readonly enabled: boolean;
  readonly apiKey?: string;
  readonly provider: 'anthropic' | 'cursor' | 'none';
}

export function liveAgentEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveAgentEnv {
  if (env.REPRO_AGENT_E2E !== '1') {
    return { enabled: false, provider: 'none' };
  }

  if (env.ANTHROPIC_API_KEY?.trim()) {
    return {
      apiKey: env.ANTHROPIC_API_KEY,
      enabled: true,
      provider: 'anthropic',
    };
  }

  if (env.CURSOR_API_KEY?.trim()) {
    return {
      apiKey: env.CURSOR_API_KEY,
      enabled: true,
      provider: 'cursor',
    };
  }

  return { enabled: false, provider: 'none' };
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  if (process.env.REPRO_AGENT_E2E === '1') {
    throw new Error(
      'Live agent provider adapters are unavailable. No mock was run. Use an external fresh agent with the published evaluation protocol, or unset REPRO_AGENT_E2E for explicitly mock coverage.',
    );
  }

  return runMockAgent(input);
}

export { runMockAgent } from './mock-agent.js';
export {
  createReproCliTools,
  isAllowedVerb,
  REPRO_CLI_VERBS,
} from './cli-tools.js';
export { bugCaptureDriver, expectedFiledFeatures } from './bug-drivers.js';
export type {
  AgentRunArtifacts,
  AgentTranscript,
  RunAgentInput,
  RunAgentResult,
  ReproCliVerb,
  TranscriptStep,
} from './types.js';
