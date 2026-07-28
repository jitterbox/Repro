import { randomUUID } from 'node:crypto';

import type { JsonValue, MonotonicClockBridge, ReproStore } from '@repro/core';
import type { StreamRedactor } from '@repro/render';

export interface CaptureEventInput {
  readonly pageId: string;
  readonly kind: string;
  readonly payload: JsonValue;
  readonly tEpoch?: number;
  readonly tMono?: number;
  /** Page performance.now() — converted via clock bridge when set. */
  readonly pageNowMs?: number;
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

  constructor(
    store: ReproStore,
    runId: string,
    clock: MonotonicClockBridge,
    redactor?: StreamRedactor,
  ) {
    this.#clock = clock;
    this.#redactor = redactor;
    this.#store = store;
    this.#runId = runId;
  }

  emitEvent(input: CaptureEventInput): void {
    this.#store.appendEvent({
      id: randomUUID(),
      kind: input.kind,
      pageId: input.pageId,
      payload: this.#redact(input.payload),
      runId: this.#runId,
      schemaVersion: 1,
      seq: this.#nextSeq(input.pageId),
      t_epoch: input.tEpoch ?? this.#clock.epochMs(),
      t_mono: this.#resolveMono(input),
    });
  }

  #resolveMono(input: CaptureEventInput): number {
    if (input.tMono !== undefined) {
      return input.tMono;
    }

    if (input.pageNowMs !== undefined) {
      try {
        return this.#clock.toMono(input.pageNowMs);
      } catch {
        return this.#clock.nowMono();
      }
    }

    return this.#clock.nowMono();
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
