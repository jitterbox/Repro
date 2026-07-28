export interface DtwSample {
  readonly timeMs: number;
  readonly value: number;
}

export interface DtwOptions {
  readonly bandRadius: number;
  readonly maxDistance?: number;
}

export interface DtwPathPoint {
  readonly left: number;
  readonly right: number;
}

export interface DtwResult {
  readonly distance: number;
  readonly confidence: number;
  readonly path: readonly DtwPathPoint[];
}

export interface DtwFallbackInput {
  readonly durationMs: number;
  readonly animated: boolean;
  readonly minDurationMs?: number;
}

export function shouldUseDtwFallback(input: DtwFallbackInput): boolean {
  const minDurationMs = input.minDurationMs ?? 1_000;

  return input.animated && input.durationMs >= minDurationMs;
}

export function bandedDtw(
  left: readonly DtwSample[],
  right: readonly DtwSample[],
  options: DtwOptions,
): DtwResult {
  if (left.length === 0 || right.length === 0) {
    return { confidence: 0, distance: Number.POSITIVE_INFINITY, path: [] };
  }

  const costs = buildCosts(left, right, options.bandRadius);
  const distance = costAt(costs, left.length - 1, right.length - 1);
  const path = backtrack(costs, left.length - 1, right.length - 1);
  const confidence = confidenceFor(distance, path.length, options.maxDistance);

  return { confidence, distance, path };
}

type CostMap = Map<string, number>;

function buildCosts(
  left: readonly DtwSample[],
  right: readonly DtwSample[],
  bandRadius: number,
): CostMap {
  const costs: CostMap = new Map();

  for (let i = 0; i < left.length; i += 1) {
    const start = Math.max(0, i - bandRadius);
    const end = Math.min(right.length - 1, i + bandRadius);

    for (let j = start; j <= end; j += 1) {
      costs.set(
        key(i, j),
        localCost(left[i], right[j]) + bestPrior(costs, i, j),
      );
    }
  }

  return costs;
}

function bestPrior(costs: CostMap, i: number, j: number): number {
  if (i === 0 && j === 0) {
    return 0;
  }

  return Math.min(
    costAt(costs, i - 1, j),
    costAt(costs, i, j - 1),
    costAt(costs, i - 1, j - 1),
  );
}

function backtrack(costs: CostMap, endI: number, endJ: number): DtwPathPoint[] {
  const path: DtwPathPoint[] = [];
  let i = endI;
  let j = endJ;

  while (i >= 0 && j >= 0 && Number.isFinite(costAt(costs, i, j))) {
    path.push({ left: i, right: j });
    const next = bestStep(costs, i, j);

    if (next === null) {
      break;
    }

    i = next.left;
    j = next.right;
  }

  return path.reverse();
}

function bestStep(costs: CostMap, i: number, j: number): DtwPathPoint | null {
  const candidates = [
    { cost: costAt(costs, i - 1, j - 1), left: i - 1, right: j - 1 },
    { cost: costAt(costs, i - 1, j), left: i - 1, right: j },
    { cost: costAt(costs, i, j - 1), left: i, right: j - 1 },
  ].filter((candidate) => candidate.left >= 0 && candidate.right >= 0);

  const best = candidates.sort((a, b) => a.cost - b.cost)[0];

  return best === undefined || !Number.isFinite(best.cost)
    ? null
    : { left: best.left, right: best.right };
}

function confidenceFor(
  distance: number,
  pathLength: number,
  maxDistance = 1,
): number {
  if (!Number.isFinite(distance) || pathLength === 0) {
    return 0;
  }

  const normalized = distance / pathLength;
  const score = 1 - normalized / Math.max(maxDistance, 0.000_001);

  return Math.max(0, Math.min(1, score));
}

function localCost(
  left: DtwSample | undefined,
  right: DtwSample | undefined,
): number {
  if (left === undefined || right === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(left.value - right.value);
}

function costAt(costs: CostMap, i: number, j: number): number {
  if (i < 0 || j < 0) {
    return Number.POSITIVE_INFINITY;
  }

  return costs.get(key(i, j)) ?? Number.POSITIVE_INFINITY;
}

function key(i: number, j: number): string {
  return `${String(i)}:${String(j)}`;
}
