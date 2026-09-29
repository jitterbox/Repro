import type { ScenePlan } from '@repro/contracts';

/** Optional, deterministic pointer feedback. It is presentation, never captured application audio. */
export function actionWave(scene: ScenePlan): Buffer {
  const rate = 24000,
    duration = scene.segments.reduce((n, s) => n + s.outDurationMs, 0),
    samples = new Float32Array(Math.ceil((duration * rate) / 1000));
  for (const cue of scene.cues.filter((c) => c.kind === 'pointer')) {
    const start = Math.round((cue.startMs * rate) / 1000),
      frequency =
        cue.action === 'right-click'
          ? 540
          : cue.action === 'cancel'
            ? 280
            : cue.action === 'hold'
              ? 680
              : 980;
    const length = Math.round(rate * (cue.action === 'hold' ? 0.12 : 0.045));
    for (let i = 0; i < length && start + i < samples.length; i++)
      samples[start + i] =
        (samples[start + i] ?? 0) +
        Math.sin((2 * Math.PI * frequency * i) / rate) *
          Math.exp(-i / (rate * 0.012)) *
          0.12;
  }
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) =>
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample)) * 32767),
      44 + i * 2,
    ),
  );
  return data;
}
