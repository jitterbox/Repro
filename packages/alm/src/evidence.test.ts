import { describe, expect, it } from 'vitest';

import {
  buildSignedEvidence,
  canonicalizeEvidence,
  hmacEvidenceSigner,
} from './evidence.js';

describe('signed evidence', () => {
  it('canonicalizes evidence with stable key ordering', () => {
    const left = canonicalizeEvidence({ b: 2, a: { z: true, c: 'x' } });
    const right = canonicalizeEvidence({ a: { c: 'x', z: true }, b: 2 });

    expect(left).toBe(right);
    expect(left).toBe('{"a":{"c":"x","z":true},"b":2}');
  });

  it('hashes every artifact before signing canonical JSON', async () => {
    const signed = await buildSignedEvidence(
      {
        artifacts: [{ bytes: 'video-bytes', name: 'repro.mp4', role: 'video' }],
        browser: 'chromium',
        buildSha: 'abcdef123',
        createdAt: '2026-07-27T23:51:09.000Z',
        env: 'qa',
        geometryDeltas: [],
        steps: [{ action: 'click save', index: 1 }],
        viewport: { deviceScaleFactor: 1, height: 720, width: 1280 },
      },
      hmacEvidenceSigner({ keyId: 'test-key', secret: 'secret' }),
    );

    expect(signed.evidence.artifacts[0]?.sha256).toHaveLength(64);
    expect(signed.canonical).toContain('"artifacts"');
    expect(signed.signature.profile).toBe('hmac-sha256');
    expect(signed.signature.value).toHaveLength(64);
  });
});
