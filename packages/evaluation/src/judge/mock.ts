import type { JudgeVerdict, VideoJudge } from './types.js';

export function mockJudge(verdict: JudgeVerdict): VideoJudge {
  return {
    assess: () => Promise.resolve(verdict),
  };
}
