import { describe, expect, it } from 'vitest';

import { EncryptedCaseVault } from './storage.js';

describe('EncryptedCaseVault', () => {
  it('encrypts and decrypts a case payload', () => {
    const vault = new EncryptedCaseVault({
      masterKey: new Uint8Array(32).fill(1),
    });
    const caseId = vault.storeCase({
      actor: 'tester',
      caseId: 'case-1',
      payload: {
        artifacts: [
          { bytes: new Uint8Array([1, 2, 3]), name: 'a.mp4', role: 'video' },
        ],
        env: 'qa',
        issueId: 'BUG-1',
        title: 'broken button',
      },
    });

    const payload = vault.readCase({ actor: 'tester', caseId });
    const preview = vault.previewCase({ actor: 'tester', caseId });

    expect(payload.issueId).toBe('BUG-1');
    expect(payload.artifacts[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(preview.artifactPreviews[0]?.sha256).toHaveLength(64);
    expect(preview.artifactPreviews[0]).not.toHaveProperty('content');
    expect(vault.auditEvents.map((event) => event.action)).toContain(
      'vault.read',
    );
  });
});
