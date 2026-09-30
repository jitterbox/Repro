import { auditProgress } from './audit-progress.js';
import { operationMetadata } from '@jitterbox/repro-core';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { inspectOcrAudit, GateError } from '@jitterbox/repro-render';
import { validateEvidence } from '@jitterbox/repro-contracts';
import { verifyRun, containedArtifact } from './evidence-run.js';
import { withRunLocks } from './run-locks.js';

/** Diagnose the same final pixels used by export; detailed findings remain local. */
export async function auditEvidence(directory: string) {
  directory = resolve(directory);
  return withRunLocks([directory], async () => {
    const run = await verifyRun(directory);
    operationMetadata({ runId: run.id });
    const assets = run.artifacts.filter((a) =>
      ['presentation-video', 'presentation-image'].includes(a.kind),
    );
    if (!assets.length)
      throw new Error('Render a presentation before auditing');
    const evidence = validateEvidence(
      JSON.parse(
        await readFile(
          join(
            directory,
            run.artifacts.find((a) => a.kind === 'presentation-spec')?.path ??
              'evidence.json',
          ),
          'utf8',
        ),
      ),
    );
    const mapping = run.artifacts.find(
      (a) => a.kind === 'presentation-frame-map',
    );
    const sourceFrameMap = mapping
      ? (JSON.parse(
          await readFile(
            await containedArtifact(directory, mapping.path),
            'utf8',
          ),
        ) as unknown[])
      : undefined;
    const reports = [];
    for (const asset of assets) {
      const path = await containedArtifact(directory, asset.path);
      const result = await inspectOcrAudit(path, {
        requireAudit: true,
        onProgress: auditProgress(),
        diagnosticsDir: join(directory, 'inspection', 'privacy-audits'),
        cacheDir: join(dirname(path), '.repro-ocr-cache'),
        patterns: evidence.privacy.patterns,
        ...(asset.kind === 'presentation-video' && sourceFrameMap
          ? { sourceFrameMap }
          : {}),
      });
      if (result.hits.length) {
        const error = new GateError(
          'OCR audit found text after strict redaction; inspect the private audit report',
          result.hits,
        );
        error.code = 'OCR_PII_DETECTED';
        error.reportPath = result.reportPath;
        error.timings = result.timings;
        throw error;
      }
      reports.push({
        artifact: path,
        reportPath: result.reportPath,
        timings: result.timings,
        stats: result.stats,
      });
    }
    return { ok: true, runId: run.id, reports };
  });
}
