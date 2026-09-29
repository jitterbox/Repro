import { join } from 'node:path';
import { probeMediaDurationMs } from '@jitterbox/repro-render';
import type { RunManifest } from '@jitterbox/repro-contracts';

/** Original media duration excludes setup before the first captured frame. */
export async function recordingDurationMs(
  directory: string,
  run: RunManifest,
): Promise<number> {
  const recording = run.artifacts.find(
    (artifact) => artifact.kind === 'recording',
  );
  if (!recording) throw new Error('Original recording is missing');
  const duration = await probeMediaDurationMs(join(directory, recording.path));
  if (duration === undefined)
    throw new Error('Original recording duration is unavailable');
  return duration;
}
