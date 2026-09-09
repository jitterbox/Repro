import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CoverageMatrix {
  readonly schemaVersion: string;
  readonly minInstances: number;
  readonly minCompareLayouts: number;
  readonly overlayKit: readonly CoverageRow[];
  readonly compareLayouts: readonly string[];
  readonly rules: readonly string[];
}

export interface CoverageRow {
  readonly component: string;
  readonly renderer: string;
  readonly owners: readonly string[];
  readonly countVia?: 'leaderLine' | 'redactionRects' | 'slateBeat';
}

export interface CoverageReport {
  readonly pass: boolean;
  readonly overlay: readonly {
    readonly component: string;
    readonly required: number;
    readonly found: number;
    readonly pass: boolean;
    readonly scenarios: readonly string[];
  }[];
  readonly compare: readonly {
    readonly layout: string;
    readonly required: number;
    readonly found: number;
    readonly pass: boolean;
    readonly paths: readonly string[];
  }[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MATRIX = join(
  HERE,
  '../../../../testdata/design-language/coverage-matrix.json',
);

export async function loadCoverageMatrix(
  path = DEFAULT_MATRIX,
): Promise<CoverageMatrix> {
  return JSON.parse(await readFile(path, 'utf8')) as CoverageMatrix;
}

export async function evaluateCoverage(input: {
  readonly fixtureRoot: string;
  readonly matrix?: CoverageMatrix;
}): Promise<CoverageReport> {
  const matrix = input.matrix ?? (await loadCoverageMatrix());
  const plans = await collectPlans(input.fixtureRoot);
  const compareMp4s = await collectCompareMp4s(input.fixtureRoot);

  const overlay = matrix.overlayKit.map((row) => {
    const hits = plans.filter((plan) => countInPlan(plan, row) > 0);
    const found = hits.reduce(
      (sum, plan) => sum + countInPlan(plan, row),
      0,
    );
    const required = matrix.minInstances;
    return {
      component: row.component,
      required,
      found,
      pass: found >= required,
      scenarios: hits.map((plan) => plan.scenario),
    };
  });

  const compare = matrix.compareLayouts.map((layout) => {
    const paths = compareMp4s.filter((path) =>
      path.includes(`${layout}_compare.mp4`),
    );
    const required = matrix.minCompareLayouts;
    return {
      layout,
      required,
      found: paths.length,
      pass: paths.length >= required,
      paths,
    };
  });

  return {
    pass: overlay.every((row) => row.pass) && compare.every((row) => row.pass),
    overlay,
    compare,
  };
}

interface PlanHit {
  readonly scenario: string;
  readonly annotations: readonly {
    readonly component?: string;
    readonly leaderLine?: unknown;
  }[];
  readonly redactionRects?: readonly unknown[];
  readonly timeline?: { readonly beats?: readonly { readonly id?: string }[] };
}

async function collectPlans(root: string): Promise<readonly PlanHit[]> {
  const scenarios = await safeReaddir(root);
  const plans: PlanHit[] = [];
  for (const scenario of scenarios) {
    const scenarioDir = join(root, scenario);
    const planPaths = await findFiles(scenarioDir, 'plan.json');
    for (const planPath of planPaths) {
      try {
        const plan = JSON.parse(await readFile(planPath, 'utf8')) as PlanHit;
        plans.push({ ...plan, scenario });
      } catch {
        // ignore invalid
      }
    }
  }
  return plans;
}

async function collectCompareMp4s(root: string): Promise<readonly string[]> {
  const files = await findFiles(root, '.mp4');
  return files.filter((path) => path.includes('_compare.mp4'));
}

function countInPlan(plan: PlanHit, row: CoverageRow): number {
  if (row.countVia === 'leaderLine') {
    return plan.annotations.filter(
      (annotation) => annotation.leaderLine !== undefined,
    ).length;
  }
  if (row.countVia === 'redactionRects') {
    return plan.redactionRects?.length ?? 0;
  }
  if (row.countVia === 'slateBeat') {
    return (plan.timeline?.beats ?? []).some((beat) => beat.id === 'slate')
      ? 1
      : 0;
  }
  return plan.annotations.filter(
    (annotation) => annotation.component === row.component,
  ).length;
}

async function findFiles(
  root: string,
  suffix: string,
): Promise<readonly string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await safeReaddir(dir);
    for (const entry of entries) {
      const path = join(dir, entry);
      let info;
      try {
        info = await stat(path);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        await walk(path);
      } else if (entry.endsWith(suffix) || path.endsWith(suffix)) {
        out.push(path);
      }
    }
  }
  await walk(root);
  return out;
}

async function safeReaddir(dir: string): Promise<readonly string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
