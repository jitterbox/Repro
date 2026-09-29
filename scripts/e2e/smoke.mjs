import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workDir = await mkdtemp(join(tmpdir(), 'repro-smoke-'));

const { runCapture } = await importDist('@jitterbox/repro-capture');
const { ReproStore } = await importDist('@jitterbox/repro-core');
const { buildPlan } = await importDist('@jitterbox/repro-plan');
const { renderPlan } = await importDist('@jitterbox/repro-render');
const { packageCommand } = await importDist('@jitterbox/repro-cli');

const config = {
  features: {
    clickViz: true,
    steps: true,
  },
  metadata: {},
  mode: 'repro',
  profile: 'controlled',
  showActions: true,
  surfaceCapture: 'page',
  viewport: {
    deviceScaleFactor: 1,
    height: 360,
    width: 640,
  },
};

const fixturePath = join(workDir, 'index.html');
await writeFile(fixturePath, htmlFixture());

const server = await serveStatic(fixturePath);
try {
  const capture = await runCapture({
    config,
    outputDir: join(workDir, 'capture'),
    run: async (session) => {
      await session.page.click('#save');
      if ((await session.page.locator('#status').textContent()) !== 'Saved')
        throw new Error('Save did not update the visible status');
      await session.showChapter('Clicked Save');
    },
    url: server.url,
  });

  const eventsPath = join(workDir, 'events.jsonl');
  const store = new ReproStore({ path: capture.storePath });
  store.exportJsonl({ path: eventsPath, runId: capture.runId });
  store.close();

  const videoPath = join(workDir, 'raw.mp4');
  await encodeTestVideo(videoPath);

  const events = await readEvents(eventsPath);
  const plan = buildPlan({
    config,
    events,
    frames: [],
    viewport: config.viewport,
  });
  const planPath = join(workDir, 'plan.json');
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  const render = await renderPlan({
    outDir: join(workDir, 'render'),
    outputName: 'smoke.mp4',
    plan,
    video: videoPath,
  });

  const viewerDir = join(workDir, 'viewer-dist');
  await mkdir(viewerDir, { recursive: true });
  await writeFile(
    join(viewerDir, 'index.html'),
    '<!doctype html><title>Smoke</title>',
  );

  const packaged = await packageCommand({
    assets: [{ kind: 'mp4', path: render.outputPath }],
    report: {
      schemaVersion: '1.0.0',
      title: 'Capture and render smoke test',
      variants: [
        {
          id: 'smoke',
          label: 'Smoke test',
          role: 'standalone',
          outcome: 'passed',
          expected: 'Save updates the visible status',
          durationMs: 1000,
        },
      ],
      chapters: [],
    },
    outDir: join(workDir, 'package'),
    viewerDir,
  });

  console.log(
    JSON.stringify(
      {
        capture,
        eventsPath,
        packagePath: packaged.manifestPath,
        planPath,
        render,
        workDir,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}

async function importDist(packageName) {
  const path = packageName.replace('@jitterbox/repro-', '');

  try {
    return await import(`../../packages/${path}/dist/index.js`);
  } catch (error) {
    throw new Error(`Build ${packageName} before running smoke E2E.`, {
      cause: error,
    });
  }
}

function htmlFixture() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Repro Smoke</title>
  </head>
  <body>
    <button id="save">Save</button>
    <p id="status">Waiting</p>
    <script>
      document.querySelector('#save').addEventListener('click', () => {
        document.querySelector('#status').textContent = 'Saved';
      });
    </script>
  </body>
</html>
`;
}

function serveStatic(path) {
  const server = createServer((request, response) => {
    void request;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    readFile(path)
      .then((html) => response.end(html))
      .catch((error) => {
        response.statusCode = 500;
        response.end(String(error));
      });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Static fixture server did not bind a port'));
        return;
      }

      resolve({
        close: () => new Promise((done) => server.close(done)),
        url: `http://127.0.0.1:${String(address.port)}/`,
      });
    });
  });
}

function encodeTestVideo(path) {
  return run('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=640x360:rate=30',
    '-t',
    '1',
    '-pix_fmt',
    'yuv420p',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    path,
  ]);
}

async function readEvents(path) {
  const text = await readFile(path, 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with ${String(code)}: ${stderr}`));
    });
  });
}
