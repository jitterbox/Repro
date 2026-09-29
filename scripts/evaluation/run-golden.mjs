import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const goldenDir = join(repoRoot, 'testdata/golden');
const outDir = join(repoRoot, '.repro/evaluation');
const outPath = join(outDir, 'golden-quality-report.json');

const { buildQualityReport, qualityMetricsFromValues } =
  await importDistEvaluation();

const files = (await readdir(goldenDir))
  .filter((file) => file.endsWith('.manifest.json'))
  .sort();

const cases = await Promise.all(files.map(evaluateGolden));
const pass = cases.every((item) => item.ok);

await mkdir(outDir, { recursive: true });
await writeFile(outPath, `${JSON.stringify({ cases, pass }, null, 2)}\n`);
console.log(JSON.stringify({ cases, outPath, pass }, null, 2));
process.exitCode = pass ? 0 : 1;

async function evaluateGolden(file) {
  const path = join(goldenDir, file);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const expected = recordValue(manifest.expected);
  const completed =
    typeof expected.completed === 'boolean' ? expected.completed : true;
  const report = buildQualityReport({
    completed,
    metrics: qualityMetricsFromValues(expected),
  });
  const expectedPass =
    typeof expected.pass === 'boolean' ? expected.pass : true;

  return {
    expectedPass,
    id: String(manifest.id ?? file),
    ok: report.pass === expectedPass,
    report,
  };
}

async function importDistEvaluation() {
  try {
    return await import('../../packages/evaluation/dist/index.js');
  } catch (error) {
    throw new Error(
      'Build @jitterbox/repro-evaluation before running golden evaluation.',
      { cause: error },
    );
  }
}

function recordValue(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}
