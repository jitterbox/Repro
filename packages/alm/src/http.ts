import { sha256 } from '@repro/core';

export type AlmFetch = typeof fetch;

export interface BinaryArtifact {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly contentType?: string;
}

export interface SizeBudget {
  readonly budgetBytes?: number;
}

export type AlmHeaders = Readonly<Record<string, string>>;

export const ALM_HARD_CAP_BYTES = 60 * 1_000 * 1_000;
export const ALM_DEFAULT_BUDGET_BYTES = 40 * 1_000 * 1_000;

export function artifactBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

export function assertSizeBudget(size: number, budget?: SizeBudget): void {
  const budgetBytes = budget?.budgetBytes ?? ALM_DEFAULT_BUDGET_BYTES;

  if (budgetBytes > ALM_DEFAULT_BUDGET_BYTES) {
    throw new RangeError('ALM budget must be 40MB or less');
  }

  if (size > ALM_HARD_CAP_BYTES) {
    throw new RangeError('ALM artifact exceeds the 60MB hard cap');
  }

  if (size > budgetBytes) {
    throw new RangeError('ALM artifact exceeds the configured budget');
  }
}

export async function verifyDownload(input: {
  readonly fetchImpl: AlmFetch;
  readonly url: string;
  readonly expectedBytes: Uint8Array;
  readonly headers?: AlmHeaders;
}): Promise<void> {
  const init =
    input.headers === undefined
      ? { method: 'GET' }
      : { headers: input.headers, method: 'GET' };
  const response = await input.fetchImpl(input.url, init);

  assertOk(response, 'download verification failed');
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (bytes.byteLength !== input.expectedBytes.byteLength) {
    throw new Error('download length did not match uploaded artifact');
  }

  if (sha256(bytes) !== sha256(input.expectedBytes)) {
    throw new Error('download sha256 did not match uploaded artifact');
  }
}

export function assertOk(
  response: Response,
  message: string,
): void {
  if (response.ok) {
    return;
  }

  throw new Error(`${message}: HTTP ${String(response.status)}`);
}
