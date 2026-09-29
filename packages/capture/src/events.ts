import { randomUUID } from 'node:crypto';

import type { JsonValue, MonotonicClockBridge, ReproStore } from '@jitterbox/repro-core';
import type { StreamRedactor } from '@jitterbox/repro-core/redactor';

export interface CaptureEventInput {
  readonly pageId: string;
  readonly kind: string;
  readonly payload: JsonValue;
  readonly tEpoch?: number;
  readonly tMono?: number;
  /** Page performance.now() — converted via clock bridge when set. */
  readonly pageNowMs?: number;
  readonly pageTimeOriginMs?: number;
  readonly documentId?: string;
}

export interface CaptureEventSink {
  emitEvent(input: CaptureEventInput): void;
}

export class StoreEventSink implements CaptureEventSink {
  readonly #clock: MonotonicClockBridge;
  readonly #runId: string;
  readonly #redactor: StreamRedactor | undefined;
  readonly #seqByPage = new Map<string, number>();
  readonly #store: ReproStore;
  readonly #requireSampledClocks: boolean;

  constructor(
    store: ReproStore,
    runId: string,
    clock: MonotonicClockBridge,
    redactor?: StreamRedactor,
    requireSampledClocks = false,
  ) {
    this.#clock = clock;
    this.#redactor = redactor;
    this.#store = store;
    this.#runId = runId;
    this.#requireSampledClocks = requireSampledClocks;
  }

  emitEvent(input: CaptureEventInput): void {
    const timing = this.#resolveMono(input);
    const payload =
      input.pageNowMs !== undefined && isObjectPayload(input.payload)
        ? { ...input.payload, captureClock: timing.calibration }
        : input.payload;
    this.#store.appendEvent({
      id: randomUUID(),
      kind: input.kind,
      pageId: input.pageId,
      payload: this.#redact(payload),
      runId: this.#runId,
      schemaVersion: 1,
      seq: this.#nextSeq(input.pageId),
      t_epoch: input.tEpoch ?? this.#clock.epochMs(),
      t_mono: timing.timeMs,
    });
  }

  #resolveMono(input: CaptureEventInput): {
    timeMs: number;
    calibration: { method: string; uncertaintyMs: number | null };
  } {
    if (input.tMono !== undefined) {
      return {
        timeMs: input.tMono,
        calibration: { method: 'host', uncertaintyMs: 0 },
      };
    }

    if (input.pageNowMs !== undefined) {
      try {
        const clockId = input.documentId ?? input.pageId;
        if (input.pageTimeOriginMs !== undefined)
          this.#clock.calibrate(input.pageTimeOriginMs, clockId);
        if (
          this.#requireSampledClocks &&
          this.#clock.calibration(clockId)?.method !== 'page-sampled'
        )
          throw new Error('Controlled clock is not yet sampled');
        const timeMs = this.#clock.toMono(input.pageNowMs, clockId);
        return {
          timeMs,
          calibration: this.#clock.calibration(clockId) ?? {
            method: 'unknown',
            uncertaintyMs: null,
          },
        };
      } catch {
        return {
          timeMs: this.#clock.nowMono(),
          calibration: { method: 'uncalibrated-receipt', uncertaintyMs: null },
        };
      }
    }

    return {
      timeMs: this.#clock.nowMono(),
      calibration: { method: 'host', uncertaintyMs: 0 },
    };
  }

  #nextSeq(pageId: string): number {
    const nextSeq = (this.#seqByPage.get(pageId) ?? 0) + 1;
    this.#seqByPage.set(pageId, nextSeq);
    return nextSeq;
  }

  #redact(payload: JsonValue): JsonValue {
    return this.#redactor?.redactJson(payload).value ?? payload;
  }
}

function isObjectPayload(
  value: JsonValue,
): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
