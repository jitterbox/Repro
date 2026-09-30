import { AsyncLocalStorage } from 'node:async_hooks';

export interface OperationTelemetry {
  phases: Record<string, number>;
  metrics: Record<string, number>;
  runId?: string;
  presentationId?: string;
  reportPath?: string;
}
const storage = new AsyncLocalStorage<OperationTelemetry>();
export const withOperationTelemetry = <T>(
  value: OperationTelemetry,
  work: () => T,
): T => storage.run(value, work);
/** Explicit allowlisted metadata only; never arguments, findings, URLs or arbitrary errors. */
export function operationMetadata(value: Partial<OperationTelemetry>) {
  const current = storage.getStore();
  if (!current) return;
  for (const group of ['phases', 'metrics'] as const)
    for (const [key, amount] of Object.entries(value[group] ?? {}))
      current[group][key] = (current[group][key] ?? 0) + amount;
  for (const key of ['runId', 'presentationId', 'reportPath'] as const)
    if (value[key] !== undefined) current[key] = value[key];
}
