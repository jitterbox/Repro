/** Public CLI watch runs retain one build server but get fresh browser storage. */
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = await mkdtemp(resolve('packages/playwright/examples/watch-'));
const out = resolve(process.env.REPRO_WATCH_OUT ?? '.repro/watch-acceptance');
await mkdir(out, { recursive: true });
const probe = createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
let child;
try {
  await writeFile(
    join(root, 'server.mjs'),
    `import {createServer} from 'node:http';createServer((q,s)=>{if(q.url==='/pid')return s.end(String(process.pid));s.setHeader('Content-Type','text/html');s.end('<!doctype html><h1>Cart</h1><p id="visits"></p><button>Checkout</button><script>const n=Number(localStorage.getItem("visits")||0)+1;localStorage.setItem("visits",n);visits.textContent=n;document.querySelector("button").onclick=()=>document.querySelector("h1").textContent="Checkout";</script>');}).listen(${port},'127.0.0.1');`,
  );
  await writeFile(
    join(root, 'server.json'),
    JSON.stringify({
      command: process.execPath,
      args: [join(root, 'server.mjs')],
      url,
    }),
  );
  await writeFile(
    join(root, 'playwright.config.ts'),
    `import {defineConfig} from '@playwright/test';export default defineConfig({testDir:'.',testMatch:'scenario.spec.ts',use:{viewport:{width:1280,height:720},deviceScaleFactor:1,timezoneId:'UTC',locale:'en-US',reducedMotion:'reduce',serviceWorkers:'block'},reporter:[['list'],['${resolve('packages/playwright/dist/reporter.js')}']]});`,
  );
  const spec = JSON.parse(
    await readFile('packages/playwright/examples/after.json', 'utf8'),
  );
  spec.targets = [];
  spec.checkpoints[0].targets = [];
  spec.checkpoints[0].highlights = [];
  spec.checkpoints[0].observations = ['assertion', 'screenshot'];
  await writeFile(join(root, 'evidence.json'), JSON.stringify(spec));
  const scenario = `import {test,expect} from '@jitterbox/repro-playwright';test('isolated watch context',async({page,repro})=>{await repro.step('prepare',async()=>{await page.goto(process.env.REPRO_URL!);await expect(page.locator('#visits')).toHaveText('1');});await repro.step('trigger',async()=>{await page.getByRole('button').click();});await repro.step('verify',async()=>{await repro.outcome('result',()=>expect(page.getByRole('heading')).toHaveText('Checkout'));await repro.checkpoint('result');});});`;
  await writeFile(join(root, 'scenario.spec.ts'), scenario);
  const results = [],
    waiting = [];
  let stderr = '',
    buffer = '';
  child = spawn(
    process.execPath,
    [
      resolve('packages/cli/dist/bin.js'),
      'run',
      'scenario.spec.ts',
      '--playwright-config',
      'playwright.config.ts',
      '--evidence',
      'evidence.json',
      '--url',
      url,
      '--out-dir',
      out,
      '--watch',
      '--watch-server',
      'server.json',
    ],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n'),
        line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line) {
        const result = JSON.parse(line);
        const waiter = waiting.shift();
        if (waiter) waiter(result);
        else results.push(result);
      }
    }
  });
  const next = () =>
    new Promise((resolve, reject) => {
      if (results.length) return resolve(results.shift());
      const timer = setTimeout(
        () => reject(new Error('Watch result timeout: ' + stderr)),
        45000,
      );
      waiting.push((result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  const first = await next();
  assert.equal(first.ok, true, JSON.stringify(first));
  const firstPid = await (await fetch(url + '/pid')).text();
  await writeFile(
    join(root, 'scenario.spec.ts'),
    scenario + '\n// Edit the committed scenario.\n',
  );
  const second = await next();
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.notEqual(first.runs[0].directory, second.runs[0].directory);
  assert.equal(await (await fetch(url + '/pid')).text(), firstPid);
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGINT');
  await exited;
  await assert.rejects(fetch(url));
  await writeFile(
    join(out, 'acceptance.json'),
    JSON.stringify(
      { passed: true, serverPid: firstPid, runs: [first, second] },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: true, serverPid: firstPid, isolatedRuns: 2 }),
  );
} finally {
  child?.kill();
  await rm(root, { recursive: true, force: true });
}
