/** Real CLI/OCR/HTTP delivery against local Jira and ADO protocol fixtures; no live issue writes. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const execute = promisify(execFile),
  root = resolve(process.env.REPRO_DELIVERY_OUT ?? '.repro/delivery');
await mkdir(root, { recursive: true });
const source = JSON.parse(
  await readFile(
    process.argv[2] ?? '.repro/public-acceptance/acceptance.json',
    'utf8',
  ),
);
const manifest = JSON.parse(
  await readFile(source.exported.manifestPath, 'utf8'),
);
const image = manifest.assets.find((asset) => asset.kind === 'png');
assert.ok(image);
const evidence = join(resolve(source.exported.manifestPath, '..'), image.href),
  expected = await readFile(evidence);
const results = [];
for (const system of ['jira', 'ado']) {
  const cwd = join(root, system);
  await mkdir(cwd, { recursive: true });
  let base,
    attached = false,
    uploads = 0,
    loseResponse = true,
    corrupt = false,
    fileName = '',
    stored;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, base),
        body = Buffer.concat(await Array.fromAsync(req));
      const remote = base + '/attachment/proof';
      const json = (value) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(value));
      };
      const entry = {
        id: 'fixture',
        filename: fileName,
        content: remote,
        size: expected.length,
      };
      if (url.pathname === '/attachment/proof')
        return res.end(corrupt ? stored.map((byte) => byte ^ 1) : stored);
      if (req.method === 'GET' && url.pathname.includes('/workitems/'))
        return json({
          relations: attached
            ? [
                {
                  rel: 'AttachedFile',
                  url: remote,
                  attributes: { name: fileName },
                },
              ]
            : [],
        });
      if (
        req.method === 'GET' &&
        url.searchParams.get('fields') === 'attachment'
      )
        return json({ fields: { attachment: attached ? [entry] : [] } });
      if (url.pathname.endsWith('/attachment/meta'))
        return json({ enabled: true, uploadLimit: 40000000 });
      if (req.method === 'POST') {
        uploads++;
        if (system === 'jira') {
          const form = await new Response(body, {
            headers: { 'Content-Type': req.headers['content-type'] },
          }).formData();
          const file = form.get('file');
          fileName = file.name;
          stored = Buffer.from(await file.arrayBuffer());
        } else {
          fileName = url.searchParams.get('fileName');
          stored = body;
        }
        assert.deepEqual(
          stored,
          expected,
          'Upload bytes must equal the audited PNG',
        );
        if (system === 'ado') return json({ id: 'fixture', url: remote });
        attached = true;
        if (loseResponse) {
          loseResponse = false;
          return req.socket.destroy();
        }
        return json([{ ...entry, filename: fileName }]);
      }
      if (req.method === 'PATCH') {
        const patch = JSON.parse(body);
        assert.equal(patch[0].value.url, remote);
        attached = true;
        if (loseResponse) {
          loseResponse = false;
          return req.socket.destroy();
        }
        return json({});
      }
      res.writeHead(404);
      res.end();
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  async function send(label) {
    try {
      const { stdout } = await execute(
        process.execPath,
        [
          resolve('packages/cli/dist/bin.js'),
          'file',
          '--system',
          system,
          '--evidence',
          evidence,
          '--title',
          'Checkout proof',
          '--issue',
          system === 'jira' ? 'BUG-7' : '7',
          '--project',
          'fixture',
          '--endpoint',
          base,
        ],
        { cwd, maxBuffer: 8 * 1024 * 1024 },
      );
      await writeFile(join(cwd, label + '.json'), stdout);
      return JSON.parse(stdout);
    } catch (error) {
      await writeFile(join(cwd, label + '.log'), String(error));
      throw error;
    }
  }
  try {
    await assert.rejects(send('lost-response'));
    assert.equal((await send('reconciled')).status, 'sent');
    assert.equal(uploads, 1);
    corrupt = true;
    await assert.rejects(send('corrupt-download'), /sha256/);
    assert.equal(uploads, 1);
    corrupt = false;
    attached = false;
    assert.equal((await send('deleted-attachment')).status, 'sent');
    assert.equal(uploads, 2);
    results.push({
      system,
      uploads,
      verifiedBytes: expected.length,
      reconciled: true,
      corruptionRejected: true,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
await writeFile(
  join(root, 'acceptance.json'),
  JSON.stringify(
    { passed: true, transport: 'loopback fixtures', results },
    null,
    2,
  ),
);
console.log(JSON.stringify({ passed: true, results }));
