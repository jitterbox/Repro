import { expect, it } from 'vitest';
import { byteRange } from './http-artifact.js';

it('supports seeking ranges and rejects impossible or multipart requests', () => {
  expect(byteRange('bytes=40-', 100)).toEqual({ start: 40, end: 99 });
  expect(byteRange('bytes=-20', 100)).toEqual({ start: 80, end: 99 });
  expect(byteRange('bytes=0-200', 100)).toEqual({ start: 0, end: 99 });
  for (const header of [
    'bytes=-0',
    'bytes=100-',
    'bytes=9-2',
    'bytes=0-1,4-6',
    'bytes=-',
  ])
    expect(byteRange(header, 100)).toBeNull();
});
