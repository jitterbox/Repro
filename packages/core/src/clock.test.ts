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
});
