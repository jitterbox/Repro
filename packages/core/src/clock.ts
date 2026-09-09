/** One run-relative clock, with a separate calibration for each page/document. */
export class MonotonicClockBridge {
  readonly #startNs = process.hrtime.bigint();
  readonly #startEpoch = Date.now();
  readonly #origins = new Map<
    string,
    {
      sourceOrigin: number;
      offset: number;
      method: 'page-epoch' | 'page-sampled';
      uncertaintyMs: number | null;
    }
  >();

  calibrate(
    pageTimeOriginMs: number,
    documentId = 'default',
    sample?: { pageNowMs: number; runTimeMs: number; uncertaintyMs: number },
  ): void {
    if (!Number.isFinite(pageTimeOriginMs))
      throw new TypeError('pageTimeOriginMs must be finite');
    const previous = this.#origins.get(documentId);
    if (!sample && previous?.sourceOrigin === pageTimeOriginMs) return;
    if (
      sample &&
      ![sample.pageNowMs, sample.runTimeMs, sample.uncertaintyMs].every(
        Number.isFinite,
      )
    )
      throw new TypeError('Clock calibration sample must be finite');
    this.#origins.set(documentId, {
      sourceOrigin: pageTimeOriginMs,
      offset: sample
        ? sample.runTimeMs - sample.pageNowMs
        : pageTimeOriginMs - this.#startEpoch,
      method: sample ? 'page-sampled' : 'page-epoch',
      uncertaintyMs: sample?.uncertaintyMs ?? null,
    });
  }

  toMono(pagePerformanceNowMs: number, documentId = 'default'): number {
    if (!Number.isFinite(pagePerformanceNowMs))
      throw new TypeError('pagePerformanceNowMs must be finite');
    const origin = this.#origins.get(documentId);
    if (origin === undefined)
      throw new Error('Clock bridge must be calibrated before use');
    const value = origin.offset + pagePerformanceNowMs;
    if (
      value < -1 ||
      (origin.method === 'page-epoch' && value > this.nowMono() + 2)
    )
      throw new Error(
        'Page clock needs sampled calibration; its epoch origin is not the capture clock',
      );
    return Math.max(0, value);
  }

  calibration(documentId = 'default') {
    const origin = this.#origins.get(documentId);
    return origin
      ? { method: origin.method, uncertaintyMs: origin.uncertaintyMs }
      : undefined;
  }

  fromEpoch(epochMs: number): number {
    if (!Number.isFinite(epochMs))
      throw new TypeError('epochMs must be finite');
    return Math.max(0, epochMs - this.#startEpoch);
  }

  nowMono(): number {
    return Number(process.hrtime.bigint() - this.#startNs) / 1_000_000;
  }
  epochMs(): number {
    return this.#startEpoch + this.nowMono();
  }
}
