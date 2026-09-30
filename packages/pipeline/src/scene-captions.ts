import type { ScenePlan } from '@jitterbox/repro-contracts';

/** Captions use the same output intervals as the rendered scene, including replay. */
export function sceneCaptions(
  scene: ScenePlan,
  retired: Record<string, number> = {},
): string {
  const timestamp = (ms: number) => {
    const value = Math.round(ms);
    const h = Math.floor(value / 3600000),
      m = Math.floor(value / 60000) % 60;
    const s = Math.floor(value / 1000) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
  };
  const text = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replace(/\r?\n\s*\r?\n/g, '\n');
  return (
    'WEBVTT\n\n' +
    scene.cues
      .filter((cue) =>
        ['title', 'step', 'marker', 'outcome'].includes(cue.kind),
      )
      .sort((a, b) => a.startMs - b.startMs)
      .map(
        (cue, i) =>
          `${i + 1}\n${timestamp(cue.startMs)} --> ${timestamp(Math.min(cue.endMs, retired[cue.id] ?? cue.endMs))}\n${text(cue.title)}${cue.detail ? `\n${text(cue.detail)}` : ''}\n`,
      )
      .join('\n')
  );
}
