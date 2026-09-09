import { expect, it } from 'vitest';
import { assertCurrentPrivacyPresentation } from './export.js';
import { PRIVACY_RENDER_METHOD } from '@repro/render';

it('rejects older presentations with pixelated or omitted selector masks despite a previous OCR pass', () => {
  const spec = {
    privacy: { selectors: ['#secret'], patterns: [], strict: true },
  };
  const plan = {
    metadata: { generatedAtEpoch: 0, durationMs: 1000 },
    redactionRects: [],
  };
  expect(() => {
    assertCurrentPrivacyPresentation(spec, plan);
  }).toThrow('Rerender');
  expect(() => {
    assertCurrentPrivacyPresentation(
      { privacy: { ...spec.privacy, selectors: [] } },
      { ...plan, redactionRects: [{ x: 0, y: 0, width: 20, height: 20 }] },
    );
  }).toThrow('Rerender');
  expect(() => {
    assertCurrentPrivacyPresentation(spec, {
      ...plan,
      metadata: { ...plan.metadata, redactionMethod: PRIVACY_RENDER_METHOD },
    });
  }).not.toThrow();
});
