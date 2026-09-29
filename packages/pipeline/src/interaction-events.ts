import type { Observation, RunManifest } from '@jitterbox/repro-contracts';

export interface CapturedEvent {
  id: string;
  kind: string;
  pageId: string;
  t_mono: number;
  payload: Record<string, unknown>;
}

/** Link observed dispatch paths to samples without equating a point sample to an action. */
export function correlateInteractionEvents(
  observations: Observation[],
  steps: RunManifest['steps'],
  events: CapturedEvent[],
): Observation[] {
  return observations.map((observation) => {
    if (observation.kind !== 'hit-test' || observation.status !== 'passed')
      return observation;
    const containing = steps.filter(
      (step) =>
        step.startMs <= observation.timeMs && step.endMs >= observation.timeMs,
    );
    const step = containing.length === 1 ? containing[0] : undefined;
    const dispatched = step
      ? events.flatMap((event) => {
          const clock = event.payload.captureClock;
          if (
            event.kind !== 'probe.pointer:path' ||
            event.payload.phase !== 'pointerdown' ||
            event.pageId !== observation.pageId ||
            event.payload.coordinateSpace !== 'viewport-css' ||
            typeof observation.data?.documentId !== 'string' ||
            event.payload.documentId !== observation.data.documentId ||
            !event.id ||
            typeof clock !== 'object' ||
            clock === null ||
            !('method' in clock) ||
            clock.method !== 'page-sampled' ||
            !('uncertaintyMs' in clock) ||
            typeof clock.uncertaintyMs !== 'number' ||
            !Number.isFinite(clock.uncertaintyMs) ||
            clock.uncertaintyMs < 0 ||
            event.t_mono - clock.uncertaintyMs < observation.timeMs ||
            event.t_mono + clock.uncertaintyMs > step.endMs ||
            !Array.isArray(event.payload.path) ||
            !event.payload.path.length ||
            !event.payload.path.every(
              (value: unknown) => typeof value === 'string',
            ) ||
            typeof event.payload.x !== 'number' ||
            typeof event.payload.y !== 'number' ||
            !Number.isFinite(event.payload.x) ||
            !Number.isFinite(event.payload.y)
          )
            return [];
          const recipient = event.payload.path[0];
          if (recipient === undefined) return [];
          return [
            {
              eventId: event.id,
              sourceArtifact: 'events.jsonl',
              documentId: event.payload.documentId,
              coordinateSpace: 'viewport-css',
              timeMs: event.t_mono,
              uncertaintyMs: clock.uncertaintyMs,
              point: { x: event.payload.x, y: event.payload.y },
              path: event.payload.path,
              recipient,
            },
          ];
        })
      : [];
    return {
      ...observation,
      data: {
        ...observation.data,
        eventCorrelation: {
          status: dispatched.length ? 'observed' : 'unavailable',
          scope: 'same-step-and-page-after-sample',
          stepId: step?.id ?? null,
          events: dispatched,
          note: 'Observed composed dispatch paths; compare actual coordinates with the sampled point. This does not establish a complete hit region or prove the recipient matched the intended locator.',
        },
      },
    };
  });
}
