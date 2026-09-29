import { expect, it } from 'vitest';
import { fitOverlayText } from './text-fit.js';
it('preserves short text and truncates wide, multiline and Unicode text without splitting surrogate pairs', () => {
  expect(fitOverlayText('OK', 120, 17)).toBe('OK');
  expect(fitOverlayText('W'.repeat(200), 180, 17)).toMatch(/…$/u);
  expect(fitOverlayText('line one\nline two', 500, 17)).toBe(
    'line one line two',
  );
  const value = fitOverlayText('😀'.repeat(100), 180, 17);
  expect(value).toMatch(/…$/u);
  expect(Array.from(value).every((c) => c === '😀' || c === '…')).toBe(true);
});

it('preserves required callout wording in the planned plate', async () => {
  const { measureOverlayTextWidth } = await import('@jitterbox/repro-plan');
  const label = 'Intended Checkout control';
  expect(
    fitOverlayText(
      label,
      Math.ceil(measureOverlayTextWidth(label, 17)),
      17,
      64,
    ),
  ).toBe(label);
});
