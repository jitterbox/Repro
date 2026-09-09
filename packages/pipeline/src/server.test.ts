import { createServer } from 'node:net';
import { expect, it } from 'vitest';
import { startScenarioServer } from './server.js';
it('keeps one owned server alive across requests and closes it after the watch session', async () => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing loopback address');
  const port = address.port;
  await new Promise<void>((resolve) =>
    probe.close(() => {
      resolve();
    }),
  );
  const url = `http://127.0.0.1:${port}`;
  const server = await startScenarioServer({
    command: process.execPath,
    args: [
      '-e',
      `require('node:http').createServer((q,s)=>s.end(String(process.pid))).listen(${port},'127.0.0.1')`,
    ],
    url,
  });
  try {
    const first = await (await fetch(url)).text(),
      second = await (await fetch(url)).text();
    expect(first).toBe(second);
    expect(Number(first)).toBeGreaterThan(0);
  } finally {
    await server.close();
  }
  await expect(fetch(url)).rejects.toThrow();
  await expect(
    startScenarioServer({
      command: process.execPath,
      args: ['-e', 'process.exit(3)'],
      url,
      startupTimeoutMs: 1000,
    }),
  ).rejects.toThrow('exited 3');
});

it('cancels a server that never becomes ready', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, 150);
  try {
    await expect(
      startScenarioServer(
        {
          command: process.execPath,
          args: ['-e', 'setInterval(()=>{},1000)'],
          url: 'http://127.0.0.1:1',
          startupTimeoutMs: 10000,
        },
        controller.signal,
      ),
    ).rejects.toThrow('cancelled');
  } finally {
    clearTimeout(timer);
  }
});
