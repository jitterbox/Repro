import type * as Alm from '@repro/alm';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  source: '',
  corrupt: false,
  sent: [] as Uint8Array[],
}));
vi.mock('@repro/render', () => ({
  enforceOcrAudit: async ({ path }: { path: string }) => {
    const sha256 = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    await writeFile(state.source, 'PRIVATE_UNAUDITED_CHANGE');
    await writeFile(
      `${path}.audit.json`,
      JSON.stringify({
        sha256: state.corrupt ? 'stale' : sha256,
        source: 'frame-ocr',
        passed: true,
      }),
    );
  },
}));
vi.mock('@repro/alm', async (original) => ({
  ...(await original<typeof Alm>()),
  JiraClient: class {
    attachFile({ bytes }: { bytes: Uint8Array }) {
      state.sent.push(bytes);
      return Promise.resolve({ id: 'mock' });
    }
  },
}));
import { deliverEvidence } from './delivery.js';

it('synthetic delivery audits immutable upload bytes and keeps private outbox state outside the bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-delivery-'));
  try {
    state.source = join(root, 'proof.png');
    state.sent = [];
    state.corrupt = false;
    await writeFile(state.source, 'synthetic safe image');
    const options = {
      system: 'jira' as const,
      evidence: state.source,
      issue: 'BUG-7',
      baseUrl: 'https://alm.test',
      stateDir: join(root, 'outbox'),
    };
    const result = await deliverEvidence(options);
    expect(result.status).toBe('sent');
    expect(Buffer.from(state.sent[0] ?? []).toString()).toBe(
      'synthetic safe image',
    );
    expect(
      (await readdir(options.stateDir)).every(
        (name) => name.endsWith('.json') || name.endsWith('.lock.sqlite'),
      ),
    ).toBe(true);
    state.corrupt = true;
    await expect(deliverEvidence(options)).rejects.toThrow(
      'immutable upload bytes',
    );
    expect(state.sent).toHaveLength(1);
    expect(
      (await readdir(options.stateDir)).some(
        (name) => name.endsWith('.lock') || name.startsWith('audit-'),
      ),
    ).toBe(false);
    await expect(
      deliverEvidence({
        ...options,
        baseUrl: 'https://alm.test?token=private',
      }),
    ).rejects.toThrow('without credentials');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
