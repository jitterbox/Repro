import { describe, expect, it } from 'vitest';

import { MonotonicClockBridge } from './clock.js';

describe('MonotonicClockBridge', () => {
  it('maps page performance time into node monotonic time', () => {
    const clock = new MonotonicClockBridge();
    const pageOrigin = Date.now() - 1_000;

    clock.calibrate(pageOrigin);

    const mapped = clock.toMono(1_000);
    const now = clock.nowMono();

    expect(Math.abs(mapped - now)).toBeLessThan(100);
  });

  it('requires calibration before converting page time', () => {
    const clock = new MonotonicClockBridge();

    expect(() => clock.toMono(0)).toThrow(/calibrated/u);
  });
  it('samples a synthetic fixed-date origin without replacing its offset on later events', () => {
    const clock = new MonotonicClockBridge();
    clock.calibrate(1704067200000, 'page-1', {
      pageNowMs: 50,
      runTimeMs: 125,
      uncertaintyMs: 2,
    });
    clock.calibrate(1704067200000, 'page-1');
    expect(clock.toMono(500, 'page-1')).toBe(575);
    expect(clock.calibration('page-1')).toEqual({
      method: 'page-sampled',
      uncertaintyMs: 2,
    });
    clock.calibrate(1704067200000, 'popup', {
      pageNowMs: 20,
      runTimeMs: 600,
      uncertaintyMs: 1,
    });
    expect(clock.toMono(40, 'popup')).toBe(620);
    expect(clock.toMono(500, 'page-1')).toBe(575);
  });
  it('does not silently clamp an uncalibrated synthetic epoch to zero', () => {
    const clock = new MonotonicClockBridge();
    clock.calibrate(1704067200000);
    expect(() => clock.toMono(100)).toThrow('sampled calibration');
  });
});
