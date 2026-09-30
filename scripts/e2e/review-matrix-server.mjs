/** Loopback, allowlisted review assets only. Raw capture files are never served. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
const root = resolve(process.env.REPRO_MATRIX_OUT ?? '.repro/review-matrix');
const assetPaths = new Map();
async function results() {
  const rows = [];
  for (const name of [
    'strategies',
    'overlays',
    'voiceover',
    'coverage',
    'fixtures',
    'fresh-agent',
  ]) {
    try {
      rows.push(
        ...JSON.parse(await readFile(resolve(root, `${name}.json`), 'utf8'))
          .rows,
      );
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  const catalog = JSON.parse(
    await readFile('testdata/evaluation/review-matrix.json', 'utf8'),
  );
  for (const [feature, ids] of Object.entries(catalog.features))
    for (const id of ids) {
      let row = rows.find((r) => r.id === id);
      if (!row) {
        row = {
          id,
          title: 'Required coverage case',
          status: 'not-run',
          level: 'No current test result',
          features: [],
          artifacts: [],
          checks: [],
        };
        rows.push(row);
      }
      row.features = [...new Set([...(row.features ?? []), feature])];
    }
  rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (const row of rows)
    for (const [index, a] of (row.artifacts ?? []).entries()) {
      const key = `${row.id}/${index}`;
      assetPaths.set(key, resolve(a.path));
      a.url = '/asset/' + key;
    }
  const features = new Set(rows.flatMap((r) => r.features ?? []));
  return {
    rows,
    generatedAt: new Date().toISOString(),
    coverage: `${features.size} feature flags represented. Read each row's evidence level: representation alone is not verified pixel coverage. Feedback is saved in this browser; download it to share.`,
  };
}
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/results.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(await results()));
      return;
    }
    if (path === '/') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(await readFile('apps/evidence-review/index.html'));
      return;
    }
    const file = assetPaths.get(path.replace(/^\/asset\//, ''));
    if (!path.startsWith('/asset/') || !file) {
      res.writeHead(404);
      res.end();
      return;
    }
    const size = (await stat(file)).size;
    res.setHeader(
      'content-type',
      {
        '.png': 'image/png',
        '.mp4': 'video/mp4',
        '.json': 'application/json',
        '.vtt': 'text/vtt',
      }[extname(file)] ?? 'text/plain',
    );
    res.setHeader('accept-ranges', 'bytes');
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]),
        end = Math.min(size - 1, range[2] ? Number(range[2]) : size - 1);
      if (start > end) {
        res.writeHead(416);
        res.end();
        return;
      }
      res.writeHead(206, {
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': end - start + 1,
      });
      createReadStream(file, { start, end }).pipe(res);
    } else {
      res.setHeader('content-length', size);
      createReadStream(file).pipe(res);
    }
  } catch (e) {
    res.writeHead(500);
    res.end('Could not read review artifact');
  }
});
await results();
server.listen(Number(process.env.REPRO_REVIEW_PORT ?? 37472), '127.0.0.1', () =>
  console.log(`Evidence review: http://127.0.0.1:${server.address().port}`),
);
