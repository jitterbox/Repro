export interface GateResult {
  readonly name: string;
  readonly pass: boolean;
  readonly message: string;
  readonly details?: unknown;
}

export type ReproMode = 'repro' | 'demo' | 'compare';

export interface DeterministicGateInput {
  readonly videoPath?: string;
  readonly planPath?: string;
  readonly timelinePath?: string;
  readonly compositionPath?: string;
  readonly baselineTimelinePath?: string;
  readonly filename?: string;
  readonly mode?: ReproMode;
  readonly bugId?: string;
  readonly strictRedaction?: boolean;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}
