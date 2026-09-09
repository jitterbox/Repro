import { expect, it } from 'vitest';
import { hitTestOutline, type Observation } from './evidence.js';
it('requires a measured sample image and repeatable geometry before drawing its diagnostic outline', () => {
  const sample: Observation = {
    id: 'sample',
    checkpoint: 'result',
    kind: 'hit-test',
    pageId: 'page-1',
    timeMs: 12,
    status: 'passed',
    artifact: 'sample.png',
    data: {
      diagnosticFrame: {
        aligned: true,
        timeMs: 13,
        endMs: 25,
        uncertaintyMs: 12,
      },
      stack: [
        {
          tag: 'div',
          id: 'overlay',
          bounds: { x: 1.5, y: 2.5, width: 22.5, height: 13.5 },
        },
      ],
    },
  };
  expect(hitTestOutline(sample)?.bounds.x).toBe(1.5);
  const withoutImage = { ...sample };
  delete withoutImage.artifact;
  expect(hitTestOutline(withoutImage)).toBeNull();
  expect(
    hitTestOutline({
      ...sample,
      data: {
        ...sample.data,
        diagnosticFrame: {
          aligned: false,
          timeMs: 13,
          endMs: 25,
          uncertaintyMs: 12,
        },
      },
    }),
  ).toBeNull();
  expect(hitTestOutline({ ...sample, kind: 'screenshot' })).toBeNull();
});
