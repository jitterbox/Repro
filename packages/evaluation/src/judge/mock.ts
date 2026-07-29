import type { JudgeInput, JudgeVerdict, VideoJudge } from './types.js';

export function mockJudge(verdict: JudgeVerdict): VideoJudge {
  return {
    assess: async (_input: JudgeInput) => verdict,
  };
}
