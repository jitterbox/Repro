import { expect, it } from 'vitest';
import { spatialOcrHits } from './ocr-spatial.js';
const tsv = (
  words: { text: string; x: number; line?: number; width?: number }[],
) =>
  [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t1000\t720\t-1\t',
    ...words.map(
      (w, i) =>
        `5\t1\t1\t1\t${w.line ?? 1}\t${i + 1}\t${w.x}\t${(w.line ?? 1) * 24}\t${w.width ?? w.text.length * 10}\t20\t95\t${w.text}`,
    ),
  ].join('\n');
it('does not join separated table cells into a phone number', () => {
  expect(
    spatialOcrHits(
      tsv([
        { text: '328', x: 0 },
        { text: '167', x: 200 },
        { text: '1735', x: 400 },
      ]),
    ).get(1),
  ).toEqual([]);
});
it('retains spaced and wrapped phone numbers with measured bounds', () => {
  for (const wrap of [false, true]) {
    const hits = spatialOcrHits(
      tsv([
        { text: '328', x: 0 },
        { text: '167', x: 40 },
        { text: '1735', x: wrap ? 0 : 80, line: wrap ? 2 : 1 },
      ]),
    ).get(1);
    expect(hits).toContainEqual(
      expect.objectContaining({
        text: '328 167 1735',
        detector: 'phone',
        confidence: 0.95,
        rect: { x: 0, y: 24, width: wrap ? 70 : 120, height: wrap ? 44 : 20 },
      }),
    );
  }
});
it('retains email, SSN, card and explicit secrets including cross-cell patterns', () => {
  for (const [text, detector] of [
    ['person@example.test', 'email'],
    ['123-45-6789', 'ssn'],
    ['4111 1111 1111 1111', 'credit-card'],
    ['repro-canary-secret-test', 'canary'],
  ])
    expect(spatialOcrHits(tsv([{ text: text ?? '', x: 0 }])).get(1)).toContainEqual(
      expect.objectContaining({ detector }),
    );
  expect(
    spatialOcrHits(
      tsv([
        { text: 'PRIVATE', x: 0 },
        { text: 'PHRASE', x: 500 },
      ]),
      ['PRIVATE PHRASE'],
    ).get(1),
  ).toContainEqual(expect.objectContaining({ detector: 'explicit-pattern' }));
});
it('rejects malformed transport instead of interpreting it as a clean scan', () => {
  expect(() => spatialOcrHits('invalid')).toThrow('Invalid OCR TSV');
  expect(() => spatialOcrHits(tsv([{ text: 'hello', x: NaN }]))).toThrow(
    'Invalid OCR word geometry',
  );
});
