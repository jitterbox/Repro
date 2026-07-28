import { describe, expect, it } from 'vitest';

import { contentAddress, hashChain, sha256 } from './hash.js';

describe('hash helpers', () => {
  it('creates deterministic content addresses for object key order', () => {
    const left = contentAddress({ a: 1, b: { c: true } });
    const right = contentAddress({ b: { c: true }, a: 1 });

    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('chains hashes through the previous event hash', () => {
    const first = hashChain(null, { kind: 'click', seq: 1 });
    const second = hashChain(first, { kind: 'click', seq: 2 });
    const withoutPrevious = hashChain(null, { kind: 'click', seq: 2 });

    expect(second).not.toBe(withoutPrevious);
  });

  it('hashes strings with sha256', () => {
    expect(sha256('repro')).toHaveLength(64);
  });
});
