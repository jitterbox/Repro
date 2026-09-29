import {
  parseScenePlan,
  parseTreatmentPlan,
  sceneCueSchema,
  type SceneCue,
  type SceneSegment,
  type EvidenceSpec,
  type RunManifest,
  type SceneRect,
} from '@repro/contracts';

export interface SceneEvent {
  id: string;
  kind: string;
  pageId: string;
  t_mono: number;
  payload: Record<string, unknown>;
}
export function compileScene(input: {
  spec: EvidenceSpec;
  run: Pick<
    RunManifest,
    'steps' | 'observations' | 'segments' | 'durationMs' | 'scenarioOutcome'
  >;
  events: SceneEvent[];
  viewport: { width: number; height: number };
  offset: number;
  treatments?: unknown;
  appVersion?: string | undefined;
}) {
  const { spec, run, viewport, events } = input;
  const treatment = parseTreatmentPlan(
    input.treatments ?? { schemaVersion: '1.0.0' },
  );
  const segments: SceneSegment[] = [];
  const cues: SceneCue[] = [];
  let output = 0;
  const addSegment = (s: Omit<SceneSegment, 'outStartMs'>) => {
    const value = { ...s, outStartMs: output };
    segments.push(value);
    output += s.outDurationMs;
    return value;
  };
  const add = (
    cue: Partial<SceneCue> &
      Pick<SceneCue, 'id' | 'kind' | 'startMs' | 'endMs' | 'title' | 'layer'>,
  ) => {
    if (cue.endMs > cue.startMs) cues.push(sceneCueSchema.parse(cue));
  };
  const boundsFor = (checkpoint: string, target: string) => {
    const candidates = run.observations.filter(
      (o) =>
        o.checkpoint === checkpoint &&
        o.target === target &&
        o.kind === 'bounds' &&
        o.status === 'passed' &&
        o.bounds,
    );
    if (candidates.length !== 1 || !candidates[0]?.bounds)
      throw new Error(`Measured bounds unavailable: ${checkpoint}/${target}`);
    const observation = candidates[0];
    const image = run.observations.find(
      (o) =>
        o.kind === 'screenshot' &&
        o.checkpoint === checkpoint &&
        o.pageId === observation.pageId &&
        o.status === 'passed' &&
        o.artifact &&
        (observation.endMs === undefined ||
          (o.timeMs >= observation.timeMs &&
            (o.endMs ?? o.timeMs) <= observation.endMs)),
    );
    if (!image)
      throw new Error(`Aligned screenshot unavailable: ${checkpoint}`);
    return { observation, image, bounds: observation.bounds as SceneRect };
  };
  const sourceEnd = run.durationMs;
  let cursor = input.offset;
  for (const step of run.steps) {
    const end = Math.min(sourceEnd, Math.max(cursor, step.endMs));
    const stepStart = output;
    if (end > cursor)
      addSegment({
        id: `play-${step.id}`,
        kind: 'play',
        sourceStartMs: cursor,
        rate: 1,
        outDurationMs: end - cursor,
      });
    cursor = end;
    const screenshots = run.observations.filter(
      (o) =>
        o.kind === 'screenshot' &&
        o.artifact &&
        o.status === 'passed' &&
        spec.checkpoints.some(
          (cp) => cp.id === o.checkpoint && cp.step === step.id,
        ),
    );
    for (const screenshot of screenshots) {
      const checkpoint = spec.checkpoints.find(
        (cp) => cp.id === screenshot.checkpoint,
      );
      if (!checkpoint) continue;
      const hold = addSegment({
        id: `hold-${screenshot.id}`,
        kind: 'hold',
        rate: 0,
        sourceStartMs: screenshot.timeMs,
        pageId: screenshot.pageId,
        checkpoint: screenshot.id,
        // Include transient evidence and sequence checkpoints: five opaque seconds.
        outDurationMs:
          Math.max(
            treatment.timing.readingHoldMs,
            spec.presentation.readingHoldMs,
          ) +
          Math.max(0, treatment.timing.entryMs + treatment.timing.exitMs - 350),
      });
      const interval = { startMs: hold.outStartMs, endMs: output };
      for (const highlight of checkpoint.highlights ?? []) {
        const measured = boundsFor(checkpoint.id, highlight.target);
        add({
          id: `highlight-${measured.observation.id}`,
          kind: 'highlight',
          ...interval,
          layer: 20,
          title: highlight.label,
          target: measured.bounds,
          evidenceRefs: [measured.observation.id, screenshot.id],
        });
      }
      for (const t of treatment.treatments.filter(
        (t) => t.checkpoint === checkpoint.id,
      )) {
        if (!t.target) continue;
        const measured = boundsFor(checkpoint.id, t.target);
        const reference = t.reference
          ? boundsFor(checkpoint.id, t.reference)
          : undefined;
        if (reference && reference.image.id !== measured.image.id)
          throw new Error(`${t.id}: alignment must share a screenshot`);
        const state = t.stateKey
          ? events
              .filter(
                (e) =>
                  e.kind === 'scenario.state' &&
                  e.pageId === screenshot.pageId &&
                  e.payload.name === t.stateKey &&
                  e.t_mono <= screenshot.timeMs,
              )
              .sort((a, b) => a.t_mono - b.t_mono)
              .at(-1)
          : undefined;
        if (t.stateKey && !state && t.required)
          throw new Error(`${t.id}: required state observation is missing`);
        add({
          id: t.id,
          kind: t.kind as 'highlight' | 'magnifier' | 'alignment' | 'callout',
          ...interval,
          layer: t.kind === 'magnifier' ? 40 : 20,
          title: t.title,
          detail: t.detail,
          severity: t.severity,
          expected: t.expected,
          dotted: t.dotted,
          observed: t.stateKey
            ? JSON.stringify(state?.payload.value ?? 'Unknown')
            : undefined,
          target: measured.bounds,
          ...(reference ? { reference: reference.bounds } : {}),
          axis: t.axis,
          magnification: t.magnification,
          evidenceRefs: [
            measured.observation.id,
            screenshot.id,
            ...(state ? [state.id] : []),
            ...(reference ? [reference.observation.id] : []),
          ],
        });
      }
    }
    add({
      id: `step-${step.id}`,
      kind: 'step',
      startMs: stepStart,
      endMs: output,
      layer: 50,
      title: spec.steps.find((s) => s.id === step.id)?.title ?? step.title,
      step: step.index,
      evidenceRefs: [step.id],
    });
  }
  if (cursor < sourceEnd)
    addSegment({
      id: 'tail',
      kind: 'play',
      sourceStartMs: cursor,
      rate: 1,
      outDurationMs: sourceEnd - cursor,
    });
  for (const t of treatment.treatments.filter((t) => t.kind === 'slowmo')) {
    const segment = run.segments.find(
      (s) => s.id === t.segment && s.status === 'passed',
    );
    if (!segment || segment.endMs <= segment.startMs)
      throw new Error(`${t.id}: recorded segment unavailable`);
    const decisive = run.observations.find(
      (o) =>
        o.kind === 'screenshot' &&
        o.status === 'passed' &&
        o.artifact &&
        o.pageId === segment.pageId &&
        o.timeMs >= segment.startMs &&
        o.timeMs <= segment.endMs &&
        spec.checkpoints.some(
          (cp) =>
            cp.id === o.checkpoint && cp.timing === 'transient' && cp.frame,
        ),
    );
    if (!decisive)
      throw new Error(
        `${t.id}: captured transient checkpoint required; slow motion cannot prove an unseen frame`,
      );
    addSegment({
      id: t.id,
      kind: 'play',
      sourceStartMs: segment.startMs,
      pageId: segment.pageId,
      rate: t.rate,
      outDurationMs: (segment.endMs - segment.startMs) / t.rate,
      label: `Slow motion · ${t.rate}×`,
    });
  }
  const outcome = run.observations.filter(
    (o) =>
      o.kind === 'assertion' &&
      o.status === 'passed' &&
      o.data?.designated === true,
  );
  if (!segments.length) throw new Error('No recorded source interval');
  if (outcome.length) {
    const finalImage = run.observations
      .filter(
        (o) =>
          o.kind === 'screenshot' &&
          o.status === 'passed' &&
          o.artifact &&
          o.timeMs >= Math.max(...outcome.map((o) => o.timeMs)),
      )
      .at(-1);
    if (finalImage) {
      const hold = addSegment({
        id: 'outcome',
        kind: 'hold',
        rate: 0,
        sourceStartMs: finalImage.timeMs,
        pageId: finalImage.pageId,
        checkpoint: finalImage.id,
        outDurationMs: treatment.timing.outcomeHoldMs,
      });
      add({
        id: 'outcome',
        kind: 'outcome',
        startMs: hold.outStartMs,
        endMs: output,
        layer: 60,
        title:
          run.scenarioOutcome === 'bug-reproduced'
            ? 'Bug reproduced'
            : run.scenarioOutcome === 'fix-verified'
              ? 'Fix verified'
              : 'Outcome recorded',
        detail: spec.expected,
        evidenceRefs: outcome.map((o) => o.id),
      });
    }
  }
  for (const t of treatment.treatments.filter((t) => t.kind === 'data-panel')) {
    const selected = events.filter(
      (e) =>
        e.kind === t.eventKind &&
        Object.entries(t.eventMatch).every(
          ([key, value]) => e.payload[key] === value,
        ),
    );
    if (!selected.length) {
      if (t.required)
        throw new Error(`${t.id}: no recorded ${t.eventKind} events`);
      else continue;
    }
    add({
      id: t.id,
      kind: 'data-panel',
      startMs: 0,
      endMs: output,
      layer: 50,
      title: t.title,
      evidenceRefs: selected.map((e) => e.id),
      format: t.format,
      unit: t.unit,
      detail: t.detail,
      severity: t.severity,
      samples: selected.map((e, index) => {
        const value = t.valuePath
          ? t.valuePath
              .split('.')
              .reduce<unknown>(
                (value, key) =>
                  value && typeof value === 'object'
                    ? Reflect.get(value, key)
                    : undefined,
                e.payload,
              )
          : (e.payload.value ?? e.payload.message ?? e.payload);
        const text =
          t.format === 'events'
            ? selected
                .slice(Math.max(0, index - 3), index + 1)
                .map((v) =>
                  JSON.stringify(
                    v.payload.message ?? v.payload.status ?? v.kind,
                  ),
                )
                .join('\n')
            : typeof value === 'string'
              ? value
              : JSON.stringify(
                  value,
                  null,
                  t.format === 'object' ? 2 : undefined,
                );
        return {
          timeMs: e.t_mono,
          text,
          ...(typeof value === 'number' ? { value } : {}),
        };
      }),
    });
  }
  const pointers = events
    .filter(
      (e) =>
        e.kind === 'probe.pointer:path' &&
        e.payload.coordinateSpace === 'viewport-css' &&
        typeof e.payload.x === 'number' &&
        typeof e.payload.y === 'number',
    )
    .sort((a, b) => a.t_mono - b.t_mono);
  const actionSteps = run.steps.filter((s) =>
    pointers.some(
      (e) =>
        e.payload.phase === 'pointerdown' &&
        e.t_mono >= s.startMs &&
        e.t_mono <= s.endMs,
    ),
  );
  for (const cue of cues.filter((c) => c.kind === 'step')) {
    const index = actionSteps.findIndex((s) => `step-${s.id}` === cue.id);
    if (index < 0) delete cue.step;
    else cue.step = index + 1;
  }
  const stepEnds = new Map(
    cues.filter((c) => c.kind === 'step').map((c) => [c.id, c.endMs]),
  );
  const sequenceEnd =
    segments.find((s) => s.id === 'outcome')?.outStartMs ?? output;
  for (const step of run.steps) {
    const action = pointers.find(
      (e) =>
        e.payload.phase === 'pointerdown' &&
        e.t_mono >= step.startMs &&
        e.t_mono <= step.endMs,
    );
    const span =
      action &&
      segments.find(
        (s) =>
          s.kind === 'play' &&
          s.sourceStartMs !== undefined &&
          action.t_mono >= s.sourceStartMs &&
          action.t_mono < s.sourceStartMs + s.outDurationMs * s.rate,
      );
    if (!action || span?.sourceStartMs === undefined) continue;
    const startMs =
      span.outStartMs + (action.t_mono - span.sourceStartMs) / span.rate;
    const intent = treatment.steps.find((s) => s.step === step.id);
    if (intent?.numbered === false) continue;
    const sequence = intent?.sequence;
    const sequenceSteps = treatment.steps
      .filter((s) => s.sequence === sequence)
      .map((s) => s.step);
    const markerEnd = sequence
      ? Math.max(
          ...sequenceSteps.map((id) => stepEnds.get(`step-${id}`) ?? startMs),
        )
      : sequenceEnd;
    const stepCue = cues.find((c) => c.id === `step-${step.id}`);
    if (stepCue) cues.splice(cues.indexOf(stepCue), 1);
    add({
      id: `marker-${step.id}`,
      kind: 'marker',
      startMs,
      endMs: markerEnd,
      layer: 50,
      title: step.title,
      detail: intent?.text ?? '',
      step:
        run.steps
          .filter((s) =>
            pointers.some(
              (e) =>
                e.payload.phase === 'pointerdown' &&
                e.t_mono >= s.startMs &&
                e.t_mono <= s.endMs,
            ),
          )
          .findIndex((s) => s.id === step.id) + 1,
      points: [
        {
          x: Number(action.payload.x),
          y: Number(action.payload.y),
          timeMs: startMs,
        },
      ],
      evidenceRefs: [action.id],
    });
  }
  for (const segment of segments.filter((s) => s.kind === 'play')) {
    const start = segment.sourceStartMs ?? 0;
    const end = start + segment.outDurationMs * segment.rate;
    const downs = pointers.filter(
      (e) =>
        e.payload.phase === 'pointerdown' &&
        e.t_mono >= start &&
        e.t_mono < end &&
        (!segment.pageId || e.pageId === segment.pageId),
    );
    for (const down of downs) {
      const nextDown = pointers.find(
        (e) =>
          e.pageId === down.pageId &&
          e.payload.phase === 'pointerdown' &&
          e.t_mono > down.t_mono,
      );
      const up = pointers.find(
        (e) =>
          e.pageId === down.pageId &&
          e.t_mono > down.t_mono &&
          ['pointerup', 'pointercancel'].includes(String(e.payload.phase)) &&
          (!nextDown || e.t_mono < nextDown.t_mono),
      );
      const points = pointers.filter(
        (e) =>
          e.pageId === down.pageId &&
          e.t_mono >= down.t_mono &&
          e.t_mono <= (up?.t_mono ?? down.t_mono),
      );
      const moved = points.some(
        (e) =>
          Math.hypot(
            Number(e.payload.x) - Number(down.payload.x),
            Number(e.payload.y) - Number(down.payload.y),
          ) > 6,
      );
      const double = events.some(
        (e) =>
          e.kind === 'probe.pointer:gesture' &&
          e.payload.action === 'double-click' &&
          e.pageId === down.pageId &&
          e.t_mono >= down.t_mono &&
          e.t_mono <= (up?.t_mono ?? down.t_mono) + 50,
      );
      const action =
        up?.payload.phase === 'pointercancel'
          ? 'cancel'
          : moved
            ? 'drag'
            : Number(down.payload.button) === 2
              ? 'right-click'
              : up && up.t_mono - down.t_mono > 450
                ? 'hold'
                : double
                  ? 'double-click'
                  : 'click';
      const from = segment.outStartMs + (down.t_mono - start) / segment.rate;
      const until = Math.min(
        segment.outStartMs + segment.outDurationMs,
        Math.max(
          from + treatment.timing.clickWaveMs,
          segment.outStartMs +
            ((up?.t_mono ?? down.t_mono) - start) / segment.rate +
            200,
        ),
      );
      add({
        id: `${segment.id}-${down.id}`,
        kind: 'pointer',
        startMs: from,
        endMs: until,
        layer: 50,
        title: action,
        action,
        evidenceRefs: [down.id, ...(up ? [up.id] : [])],
        points: points.map((e) => ({
          x: Number(e.payload.x),
          y: Number(e.payload.y),
          timeMs: segment.outStartMs + (e.t_mono - start) / segment.rate,
        })),
      });
    }
  }
  for (const t of treatment.treatments)
    if (
      t.required &&
      !cues.some((c) => c.id === t.id) &&
      !segments.some((s) => s.id === t.id)
    )
      throw new Error(`Required treatment was not compiled: ${t.id}`);
  if (input.appVersion)
    add({
      id: 'app-version',
      kind: 'app-version',
      startMs: 0,
      endMs: output,
      layer: 60,
      title: 'App version / build',
      detail: input.appVersion,
      evidenceRefs: [],
    });
  add({
    id: 'title',
    kind: 'title',
    startMs: 0,
    endMs: output,
    layer: 60,
    title: spec.title,
    detail: `${spec.id} · ${spec.variant.label}`,
    evidenceRefs: [],
  });
  return parseScenePlan({
    schemaVersion: '1.0.0',
    renderer: 'hyperframes',
    viewport: { width: viewport.width, height: viewport.height },
    output: {
      width:
        Math.ceil(
          (viewport.width +
            treatment.style.outerInset * 2 +
            treatment.style.gutterGap +
            treatment.style.cardWidth) /
            2,
        ) * 2,
      height:
        Math.ceil(
          Math.max(
            treatment.style.minHeight,
            viewport.height +
              (viewport.width < 768
                ? treatment.style.mobileSourceTop
                : treatment.style.sourceTop) +
              treatment.style.outerInset * 2,
          ) / 2,
        ) * 2,
      fps: 30,
    },
    style: treatment.style,
    timing: treatment.timing,
    encoding: treatment.encoding,
    outputScale: treatment.outputScale,
    actionAudio: treatment.actionAudio,
    cursorGlow: treatment.cursorGlow,
    cursorSamples: pointers.map((e) => ({
      x: Number(e.payload.x),
      y: Number(e.payload.y),
      timeMs: e.t_mono,
      pageId: e.pageId,
      phase: String(e.payload.phase),
    })),
    sourceOrigin: {
      x: treatment.style.outerInset,
      y:
        viewport.width < 768
          ? treatment.style.mobileSourceTop
          : treatment.style.sourceTop,
    },
    segments,
    cues,
  });
}
