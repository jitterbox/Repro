export interface JudgeFinding {
  readonly message: string;
  readonly confidence: number;
}

export interface JudgeVerdict {
  readonly pass: boolean;
  readonly score: number;
  readonly summary: string;
  readonly findings: readonly JudgeFinding[];
}

export interface JudgeInput {
  readonly videoPath: string;
  readonly planPath?: string | undefined;
  readonly rubric?: string | undefined;
  readonly bugId?: string | undefined;
}

export interface VideoJudge {
  assess(input: JudgeInput): Promise<JudgeVerdict>;
}
