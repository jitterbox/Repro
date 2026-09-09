/** Real Chromium network traffic through legacy public capture; never exports raw HAR. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const execute = promisify(execFile);
const output = resolve(
  process.env.REPRO_HAR_PRIVACY_OUT ?? '.repro/har-privacy',
);
await mkdir(output, { recursive: true });
const canary = 'REPRO_PRIVATE_NETWORK_CANARY';
const received = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  received.push({
    url: req.url,
    method: req.method,
    body,
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
  });
  if (req.url.startsWith('/api')) {
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': `secret=${canary}`,
      'x-private': canary,
    });
    res.end(JSON.stringify({ private: canary }));
    return;
  }
  if (req.url === '/hold') {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'image/svg+xml' });
      res.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      );
    }, 500);
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html',
    'set-cookie': `secret=${canary}`,
  });
  res.end(
    `<title>${canary}</title><h1>Network privacy fixture</h1><img src="/hold"><script>fetch('/api?private=${canary}&access_token=${canary}', {method:'POST',headers:{Authorization:'Bearer ${canary}','Content-Type':'application/json'},body:JSON.stringify({private:'${canary}'})})</script>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const config = join(output, 'repro.config.json');
  await writeFile(
    config,
    JSON.stringify({
      mode: 'repro',
      profile: 'faithful',
      surfaceCapture: 'page',
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
      features: {},
    }),
  );
  const invoke = async (...args) =>
    JSON.parse(
      (
        await execute(
          process.execPath,
          [resolve('packages/cli/dist/bin.js'), ...args],
          { maxBuffer: 8 * 1024 * 1024 },
        )
      ).stdout,
    );
  await execute(process.execPath, [
    resolve('packages/cli/dist/bin.js'),
    'validate-config',
    '--config',
    config,
  ]);
  const capture = await invoke(
    'capture',
    '--config',
    config,
    '--url',
    `http://127.0.0.1:${server.address().port}`,
    '--out-dir',
    join(output, 'capture'),
  );
  const raw = await readFile(join(capture.outputDir, 'network.har'), 'utf8');
  const har = JSON.parse(raw);
  const actual = received.find((r) => r.method === 'POST');
  assert.ok(
    actual &&
      actual.body.includes(canary) &&
      actual.authorization.includes(canary) &&
      actual.cookie.includes(canary),
    'Canaries did not traverse the real browser request',
  );
  assert.ok(
    har.log.entries.some((e) => e.request.method === 'POST'),
    'Captured POST missing',
  );
  assert.ok(!raw.includes(canary), 'Sanitized HAR retains private text');
  assert.ok(!(await readdir(capture.outputDir)).includes('network.raw.har'));
  const result = {
    passed: true,
    directory: capture.outputDir,
    entries: har.log.entries.length,
    checks: [
      'actual POST, authentication and cookie canaries',
      'query and OAuth values',
      'request/response bodies',
      'response cookie/header',
      'document title',
      'raw HAR deletion',
    ],
  };
  await writeFile(
    join(output, 'acceptance.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await new Promise((resolve) => server.close(resolve));
}
