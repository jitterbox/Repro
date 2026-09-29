import { serveArtifact } from './http-artifact.js';
import { reviewDocumentHtml } from '@jitterbox/repro-viewer';
import { compareEvidence } from './comparison.js';
import { recordingDurationMs } from './recording-duration.js';
import { createServer } from 'node:http';
import { access, mkdir, readFile } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { runProcess } from '@jitterbox/repro-core';
import { rasterCropBounds, observationUncertaintyMs } from '@jitterbox/repro-contracts';
import { containedArtifact, verifyRun, writeJson } from './evidence-run.js';
export async function inspectFrame(
  directory: string,
  selection: {
    checkpoint?: string | undefined;
    timeMs?: number | undefined;
    target?: string | undefined;
  },
) {
  directory = resolve(directory);
  const run = await verifyRun(directory);
  if ((selection.checkpoint === undefined) === (selection.timeMs === undefined))
    throw new Error('Select exactly one checkpoint or timestamp');
  const output = join(directory, 'inspection');
  await mkdir(output, { recursive: true });
  let context: string;
  let actualMs: number;
  let uncertaintyMs: number;
  let requestedMs = selection.timeMs;
  let eventSelection: Record<string, unknown> | undefined;
  if (selection.checkpoint) {
    const observation = run.observations.find(
      (o) =>
        o.checkpoint === selection.checkpoint &&
        o.kind === 'screenshot' &&
        o.status === 'passed',
    );
    if (!observation?.artifact)
      throw new Error('Required checkpoint screenshot missing');
    context = join(directory, observation.artifact);
    actualMs = observation.timeMs;
    uncertaintyMs = observationUncertaintyMs(observation);
    if (observation.data?.selection === 'event-linked') {
      eventSelection = observation.data;
      requestedMs = Number(observation.data.requestedMs);
    }
  } else {
    const offset = Number(run.environment.recordingStartMs ?? 0);
    const requested = requireValue(selection.timeMs);
    if (
      !Number.isFinite(requested) ||
      requested < offset ||
      requested > run.durationMs
    )
      throw new Error('Timestamp outside captured interval');
    const index = Math.round(((requested - offset) * 30) / 1000);
    actualMs = offset + (index * 1000) / 30;
    uncertaintyMs = 1000 / 30;
    context = join(output, `frame-${index}.png`);
    await runProcess('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      await containedArtifact(
        directory,
        requireValue(run.artifacts.find((a) => a.kind === 'recording')?.path),
      ),
      '-vf',
      `select=eq(n\\,${index})`,
      '-frames:v',
      '1',
      context,
    ]);
  }
  await access(context).catch(() => {
    throw new Error('No captured frame at the selected timestamp');
  });
  const bounds = run.observations.find(
    (o) =>
      o.checkpoint === selection.checkpoint &&
      o.kind === 'bounds' &&
      o.status === 'passed' &&
      (!selection.target || o.target === selection.target),
  );
  if (selection.target && (!bounds?.bounds || !bounds.data?.crop))
    throw new Error('Requested target has no unambiguous frame-aligned bounds');
  const clip = bounds?.data?.crop as
    { x: number; y: number; width: number; height: number } | undefined;
  let crop: string | undefined;
  let transform: ReturnType<typeof rasterCropBounds> | undefined;
  if (clip) {
    const scale = Number(bounds?.data?.deviceScaleFactor ?? 1);
    transform = rasterCropBounds(
      clip,
      run.environment.viewport as { width: number; height: number },
      scale,
    );
    const pixels = transform.pixels;
    crop = join(output, `${selection.checkpoint}-${bounds?.target}-crop.png`);
    await runProcess('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      context,
      '-vf',
      `crop=${pixels.width}:${pixels.height}:${pixels.x}:${pixels.y}:exact=1`,
      '-frames:v',
      '1',
      crop,
    ]);
  }
  const result = {
    context,
    crop: crop ?? null,
    actualMs,
    requestedMs: requestedMs ?? actualMs,
    selectionOffsetMs: actualMs - (requestedMs ?? actualMs),
    ...(eventSelection ? { eventSelection } : {}),
    uncertaintyMs,
    cropTransform: transform?.css ?? null,
    requestedCrop: clip ?? null,
    pixelTransform: transform?.pixels ?? null,
    pixelScale: transform?.scale ?? null,
    coordinateSpace: 'viewport-css',
    runId: run.id,
  };
  await writeJson(join(output, 'selection.json'), result);
  return result;
}
export async function reviewRun(
  directory: string,
  port = 0,
  baseline?: string,
  presentation = false,
) {
  const root = resolve(directory);
  const run = await verifyRun(root);
  const before = baseline ? await verifyRun(baseline) : run;
  const comparison = baseline
    ? await compareEvidence(baseline, root)
    : undefined;
  let html = reviewDocumentHtml({
    before: {
      run: before,
      prefix: '/before',
      originalDurationMs:
        comparison?.originalDurations.before ??
        (await recordingDurationMs(root, run)),
    },
    ...(baseline && comparison
      ? {
          after: {
            run,
            prefix: '/after',
            originalDurationMs: comparison.originalDurations.after,
          },
        }
      : {}),
    ...(comparison
      ? {
          knots: comparison.composition.sync.knots,
          alignment: {
            verified: comparison.ok,
            matchedCheckpoints:
              comparison.matched.length + comparison.imageMatches.length,
            imageMatches: comparison.imageMatches,
            scenarioSource: comparison.scenarioSource,
            unmatched: comparison.unmatched,
            lowConfidenceSpans:
              comparison.composition.sync.lowConfidenceSpans ?? [],
          },
        }
      : {}),
  });
  if (presentation) {
    if (baseline)
      throw new Error(
        'Scene presentation review is single-run; inspect original comparison separately',
      );
    const review = run.artifacts.find((a) => a.kind === 'presentation-review');
    const video = run.artifacts.find((a) => a.kind === 'presentation-video');
    if (!review || !video) throw new Error('Render a scene presentation first');
    html = (
      await readFile(await containedArtifact(root, review.path), 'utf8')
    ).replace('src="proof.mp4"', `src="/before/${video.path}"`);
  }
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const pathname = decodeURIComponent(
          new URL(req.url ?? '/', 'http://localhost').pathname,
        );
        if (pathname === '/') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
          return;
        }
        const mount = pathname.startsWith('/before/')
          ? {
              root: baseline ? resolve(baseline) : root,
              run: before,
              prefix: '/before/',
            }
          : { root, run, prefix: '/after/' };
        const file = resolve(mount.root, pathname.slice(mount.prefix.length));
        if (
          !pathname.startsWith(mount.prefix) ||
          !file.startsWith(mount.root + sep) ||
          !mount.run.artifacts.some((a) => join(mount.root, a.path) === file)
        ) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.setHeader(
          'Content-Type',
          (
            {
              '.mp4': 'video/mp4',
              '.html': 'text/html; charset=utf-8',
              '.png': 'image/png',
              '.json': 'application/json',
            } as Record<string, string>
          )[extname(file)] ?? 'application/octet-stream',
        );
        // Resolve again at request time, since review may remain open while files change.
        await serveArtifact(
          req,
          res,
          await containedArtifact(
            mount.root,
            pathname.slice(mount.prefix.length),
          ),
        );
      } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Review server unavailable');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      ),
  };
}

function requireValue<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required evidence value is missing');
  return value;
}
