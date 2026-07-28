export type RetentionDecision = 'retain' | 'delete';

export interface RetentionSubject {
  readonly id: string;
  readonly createdAtEpoch: number;
  readonly tags?: readonly string[];
}

export interface RetentionPolicy {
  readonly name: string;
  readonly ttlMs: number;
}

export interface RetentionEvaluation {
  readonly decision: RetentionDecision;
  readonly policy: string;
  readonly reason: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly subjectId: string;
  readonly action: string;
  readonly atEpoch: number;
  readonly details: Record<string, string | number | boolean>;
}

export interface AuditTrail {
  append(event: AuditEvent): void;
}

export interface DeletionHook {
  delete(subject: RetentionSubject): Promise<void>;
}

export class InMemoryAuditTrail implements AuditTrail {
  readonly events: AuditEvent[] = [];

  append(event: AuditEvent): void {
    this.events.push(event);
  }
}

export async function applyRetention(input: {
  readonly subject: RetentionSubject;
  readonly policy: RetentionPolicy;
  readonly hook: DeletionHook;
  readonly audit: AuditTrail;
  readonly nowEpoch?: number;
}): Promise<RetentionEvaluation> {
  const now = input.nowEpoch ?? Date.now();
  const evaluation = evaluateRetention(input.subject, input.policy, now);
  audit(input.audit, input.subject.id, 'retention.evaluate', now, {
    decision: evaluation.decision,
    policy: evaluation.policy,
  });

  if (evaluation.decision !== 'delete') {
    return evaluation;
  }

  await input.hook.delete(input.subject);
  audit(input.audit, input.subject.id, 'retention.delete', now, {
    policy: input.policy.name,
  });

  return evaluation;
}

export function evaluateRetention(
  subject: RetentionSubject,
  policy: RetentionPolicy,
  nowEpoch: number,
): RetentionEvaluation {
  const expiresAt = subject.createdAtEpoch + policy.ttlMs;

  if (nowEpoch < expiresAt) {
    return {
      decision: 'retain',
      policy: policy.name,
      reason: 'subject is within retention window',
    };
  }

  return {
    decision: 'delete',
    policy: policy.name,
    reason: 'subject exceeded retention window',
  };
}

function audit(
  trail: AuditTrail,
  subjectId: string,
  action: string,
  atEpoch: number,
  details: Record<string, string | number | boolean>,
): void {
  trail.append({
    action,
    atEpoch,
    details,
    id: `${subjectId}:${action}:${String(atEpoch)}`,
    subjectId,
  });
}
