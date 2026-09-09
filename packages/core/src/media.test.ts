import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { runProcess } from './media.js';

it('does not launch an already-cancelled process', async () => {
  await expect(
    runProcess('missing-command', [], {
      signal: AbortSignal.abort(),
    }),
  ).rejects.toMatchObject({ name: 'AbortError', category: 'cancelled' });
});

it('cancels descendants before allowing the next run to bind their port', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'repro-cancel-'));
  const ready = join(directory, 'ready.json');
  const controller = new AbortController();
  const descendant = `
    const net = require('node:net');
    const fs = require('node:fs');
    process.on('SIGTERM', () => {});
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => fs.writeFileSync(
      ${JSON.stringify(ready)}, JSON.stringify({ port: server.address().port, pid: process.pid })
    ));
  `;
  // The parent exits on TERM; its server deliberately ignores TERM and inherits pipes.
  const parent = `require('node:child_process').spawn(process.execPath,
    ['-e', ${JSON.stringify(descendant)}], { stdio: 'inherit' });`;
  const result = runProcess(process.execPath, ['-e', parent], {
    signal: controller.signal,
  }).then(
    () => null,
    (error: unknown) => error,
  );
  let serverPid: number | undefined;
  try {
    let port: number | undefined;
    for (let attempt = 0; attempt < 100 && port === undefined; attempt++) {
      try {
        const info = JSON.parse(await readFile(ready, 'utf8')) as {
          port: number;
          pid: number;
        };
        port = info.port;
        serverPid = info.pid;
      } catch {
        await delay(20);
      }
    }
    expect(port).toBeTypeOf('number');
    if (port === undefined) throw new Error('Descendant server did not start');
    controller.abort();
    expect(await result).toMatchObject({
      name: 'AbortError',
      category: 'cancelled',
    });
    const replacement = createServer();
    await new Promise<void>((resolve, reject) => {
      replacement.once('error', reject);
      replacement.listen(port, '127.0.0.1', resolve);
    });
    await new Promise<void>((resolve, reject) => {
      replacement.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    controller.abort();
    if (serverPid !== undefined) {
      try {
        process.kill(serverPid, 'SIGKILL');
      } catch {
        /* Already terminated. */
      }
    }
    await result;
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);
