export const DEFAULT_CANARY_SECRET = 'repro-canary-secret-9f1f2d7a';

export interface CanaryLeak {
  readonly path: string;
  readonly value: string;
}

export interface CanaryAssertion {
  readonly leaks: readonly CanaryLeak[];
  readonly ok: boolean;
}

export function withCanarySecret<T extends Readonly<Record<string, unknown>>>(
  value: T,
  secret = DEFAULT_CANARY_SECRET,
): T & { readonly canarySecret: string } {
  return {
    ...value,
    canarySecret: secret,
  };
}

export function assertNoCanaryLeak(
  value: unknown,
  secret = DEFAULT_CANARY_SECRET,
): CanaryAssertion {
  const leaks = findCanaryLeaks(value, secret);
  return {
    leaks,
    ok: leaks.length === 0,
  };
}

export function findCanaryLeaks(
  value: unknown,
  secret = DEFAULT_CANARY_SECRET,
): readonly CanaryLeak[] {
  return collectLeaks('$', value, secret);
}

function collectLeaks(
  path: string,
  value: unknown,
  secret: string,
): readonly CanaryLeak[] {
  if (typeof value === 'string') {
    return value.includes(secret) ? [{ path, value }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      return collectLeaks(`${path}[${String(index)}]`, item, secret);
    });
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => {
    return collectLeaks(`${path}.${key}`, item, secret);
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
