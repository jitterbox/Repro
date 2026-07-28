const NS_PER_MS = 1_000_000n;

export class MonotonicClockBridge {
  #pageOriginMonoNs: bigint | undefined;

  calibrate(pageTimeOriginMs: number): void {
    if (!Number.isFinite(pageTimeOriginMs)) {
      throw new TypeError('pageTimeOriginMs must be finite');
    }

    const nodeMonoNs = process.hrtime.bigint();
    const epochDeltaMs = Date.now() - pageTimeOriginMs;
    this.#pageOriginMonoNs = nodeMonoNs - msToNs(epochDeltaMs);
  }

  toMono(pagePerformanceNowMs: number): number {
    if (!Number.isFinite(pagePerformanceNowMs)) {
      throw new TypeError('pagePerformanceNowMs must be finite');
    }

    const originNs = this.#pageOriginMonoNs;
    if (originNs === undefined) {
      throw new Error('Clock bridge must be calibrated before use');
    }

    return nsToMs(originNs + msToNs(pagePerformanceNowMs));
  }

  nowMono(): number {
    return nsToMs(process.hrtime.bigint());
  }

  epochMs(): number {
    return Date.now();
  }
}

function msToNs(ms: number): bigint {
  return BigInt(Math.round(ms * Number(NS_PER_MS)));
}

function nsToMs(ns: bigint): number {
  return Number(ns) / Number(NS_PER_MS);
}
