import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { verifyTerminalCheckpoint } from '../terminal-checkpoint.mjs';
const execute = promisify(execFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
function contained(root, path) {
  const full = resolve(root, path);
  assert.ok(
    full.startsWith(resolve(root) + sep),
    `Artifact escapes directory: ${path}`,
  );
  return full;
}

/** Objective checks complement the separately recorded editorial/source review. */
export async function verifyPair(record) {
  const pair = [];
  for (const role of ['before', 'after']) {
    const directory = record.runs[role];
    const run = await json(resolve(directory, 'run.json'));
    assert.equal(
      run.pipelineOutcome,
      'passed',
      `${record.id}/${role}: pipeline`,
    );
    assert.equal(
      run.scenarioOutcome,
      role === 'before' ? 'bug-reproduced' : 'fix-verified',
      `${record.id}/${role}: designated outcome`,
    );
    assert.equal(run.variant.role, role);
    assert.ok(
      run.steps.length >= 3,
      `${record.id}: missing meaningful sequence`,
    );
    assert.equal(run.errors.length, 0);
    for (const artifact of run.artifacts) {
      const bytes = await readFile(contained(directory, artifact.path));
      assert.equal(
        hash(bytes),
        artifact.sha256,
        `${record.id}: corrupt ${artifact.path}`,
      );
    }
    const evidence = await json(resolve(directory, 'evidence.json'));
    await verifyTerminalCheckpoint(
      directory,
      resolve(directory, 'inspection-terminal'),
    );
    assert.ok(evidence.title && evidence.claim && evidence.expected);
    assert.ok(evidence.steps.some((step) => step.trigger));
    assert.equal(run.environment.appliedConfiguration.redaction.strict, true);
    pair.push({ run, evidence });
  }
  assert.equal(
    pair[0].run.scenario.executableHash,
    pair[1].run.scenario.executableHash,
  );
  assert.equal(pair[0].evidence.claim, pair[1].evidence.claim);
  assert.equal(pair[0].evidence.expected, pair[1].evidence.expected);
  if (record.id === 'FA-01') {
    for (const [index, expected] of [false, true].entries()) {
      const hit = pair[index].run.observations.find(
        (o) => o.kind === 'hit-test',
      );
      assert.equal(
        hit?.data?.intendedReceives,
        expected,
        'Actual interception sample',
      );
      assert.ok(
        hit.data.eventCorrelation.events.length,
        'Natural event recipient evidence',
      );
    }
  }
  if (['FA-03', 'FA-04'].includes(record.id)) {
    for (const { run } of pair)
      assert.equal(
        run.environment.appliedConfiguration.profile,
        'faithful',
        'Timing proof must remain faithful',
      );
  }
  if (record.id === 'FA-04') {
    for (const { run } of pair) {
      assert.ok(run.segments.some((segment) => segment.status === 'passed'));
      assert.ok(
        run.observations.some(
          (o) =>
            o.kind === 'screenshot' && o.data?.selection === 'event-linked',
        ),
        'Decisive event-selected frame required',
      );
    }
  }
  if (record.id === 'FA-05') {
    const lefts = pair.map(({ run }) => {
      assert.equal(run.environment.appliedConfiguration.profile, 'controlled');
      const bounds = run.observations.filter(
        (o) => o.kind === 'bounds' && o.status === 'passed',
      );
      assert.ok(bounds.length > 0);
      return bounds;
    });
    const deltas = lefts[0].flatMap((a) =>
      lefts[1]
        .filter((b) => a.target === b.target && a.checkpoint === b.checkpoint)
        .map((b) => a.bounds.x - b.bounds.x),
    );
    assert.ok(
      deltas.some((delta) => Math.abs(delta - 12) < 0.1),
      'Measure the actual 12 CSS-pixel shift, not the ticket guess',
    );
  }
  const artifacts = [];
  const roles = new Set();
  const mediaHashes = new Set(
    pair.flatMap(({ run }) => run.artifacts.map((a) => a.sha256)),
  );
  for (const manifestPath of record.exportManifestPaths ?? [
    record.exportManifestPath,
  ]) {
    const manifest = await json(manifestPath);
    const root = dirname(manifestPath);
    for (const asset of manifest.assets) {
      const path = contained(root, asset.href ?? asset.path);
      assert.equal(
        hash(await readFile(path)),
        asset.sha256,
        'Export asset hash',
      );
      if (!['mp4', 'png'].includes(asset.kind)) continue;
      assert.ok(
        mediaHashes.has(asset.sha256),
        'Export media must belong to the verified primary runs',
      );
      roles.add(asset.role);
      const audit = await json(path + '.audit.json');
      assert.equal(audit.sha256, asset.sha256);
      assert.equal(audit.passed, true);
      assert.equal(audit.source, 'frame-ocr');
      assert.ok(audit.policyHash && audit.policyVersion && audit.toolVersion);
      if (asset.kind === 'mp4')
        await execute('ffmpeg', [
          '-v',
          'error',
          '-xerror',
          '-i',
          path,
          '-f',
          'null',
          '-',
        ]);
      artifacts.push({
        label: `${asset.role ?? ''} ${asset.title ?? asset.kind}`.trim(),
        path,
      });
    }
  }
  assert.ok(
    roles.has('before') && roles.has('after'),
    'Both variant roles must be exported',
  );
  assert.ok(artifacts.some((a) => a.path.endsWith('.mp4')));
  assert.ok(artifacts.some((a) => a.path.endsWith('.png')));
  return {
    id: record.id,
    title: pair[0].evidence.title,
    status: 'passed',
    level:
      'Fresh-agent submission: independently checked outcomes, hashes, decoded media and OCR audits; see editorial review',
    features: ['steps', 'redaction'],
    strategies: record.strategies ?? [],
    artifacts,
    checks: [
      'Same executable scenario and claim across variants',
      'Designated bug reproduced before and fix verified after',
      'All capture and export artifact hashes verified',
      'Exported media audits match actual bytes and policy versions',
      'Every exported MP4 fully decoded',
    ],
  };
}
