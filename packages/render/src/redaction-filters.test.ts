import { expect, it } from 'vitest';
import {
  buildPrivacyBlurFilter,
  privacyBlurSigma,
} from './redaction-filters.js';

it('sets privacy blur to the shorter side of the mask', () => {
  expect(privacyBlurSigma(44, 38)).toBe(38);
  expect(privacyBlurSigma(2.5, 2.5)).toBe(8);
  expect(privacyBlurSigma(400, 900)).toBe(400);
  expect(privacyBlurSigma(0, 10)).toBe(0);
});

it('blurs each region inside its own crop', () => {
  const filter = buildPrivacyBlurFilter({
    rects: [{ x: 1, y: 1, width: 8, height: 8 }],
    sourceLabel: '[0:v]',
    outputLabel: '[sanitized]',
    viewport: { width: 10, height: 10 },
    image: { width: 20, height: 20 },
  });
  expect(filter).toContain('crop=w=16:h=16:x=2:y=2');
  expect(filter).toContain('gblur=sigma=16.000');
  expect(filter).toContain('overlay=x=2:y=2:format=rgb');
  expect(filter).not.toContain('drawbox');
});

it('averages a crop too small for a stable gaussian', () => {
  const filter = buildPrivacyBlurFilter({
    rects: [{ x: 2.25, y: 3.25, width: 2.5, height: 2.5 }],
    sourceLabel: '[0:v]',
    outputLabel: '[sanitized]',
    viewport: { width: 10, height: 10 },
    image: { width: 20, height: 20 },
  });
  expect(filter).toContain('scale=1:1:flags=area');
  expect(filter).not.toContain('gblur');
});

it('splits a blur that exceeds one gblur pass', () => {
  const filter = buildPrivacyBlurFilter({
    rects: [{ x: 0, y: 0, width: 2000, height: 2000 }],
    sourceLabel: '[0:v]',
    outputLabel: '[sanitized]',
    viewport: { width: 2000, height: 2000 },
  });
  expect(filter.match(/gblur=sigma=1000\.000/g)).toHaveLength(4);
});
