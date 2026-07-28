import { createServer } from 'vite';
import { join } from 'node:path';

import { getRepoRoot } from './bugs.js';

export type FixtureMode = 'broken' | 'fixed';

export interface ShopliteServer {
  readonly url: string;
  readonly close: () => Promise<void>;
  fixtureUrl(mode: FixtureMode): string;
}

export async function startShopliteServer(): Promise<ShopliteServer> {
  const root = join(getRepoRoot(), 'apps/shoplite');
  const server = await createServer({
    root,
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
    logLevel: 'error',
  });

  await server.listen();
  const urls = server.resolvedUrls?.local;
  const base = urls?.[0];
  if (base === undefined) {
    await server.close();
    throw new Error('ShopLite Vite server did not resolve a local URL');
  }

  const normalized = base.replace(/\/$/u, '');

  return {
    url: normalized,
    fixtureUrl: (mode) => `${normalized}/?fixture=${mode}`,
    close: async () => {
      await server.close();
    },
  };
}
