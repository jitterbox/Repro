/** Browser acceptance of an audited bundle copied to an unrelated directory. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { serveArtifact } from '../../packages/pipeline/dist/http-artifact.js';

export async function verifyPortableViewer(bundle, output, viewerBuild) {
  const relocated = await mkdtemp(join(tmpdir(), 'repro-relocated-'));
  await cp(bundle, relocated, { recursive: true });
  // Focused UI regression can reuse unchanged audited media with a new viewer
  // build; the full public workflow omits this override and tests the export.
  if (viewerBuild)
    await cp(viewerBuild, join(relocated, 'viewer'), { recursive: true });
  await mkdir(output, { recursive: true });
  const server = createServer((req, res) => {
    const path = resolve(
      relocated,
      `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`,
    );
    if (!path.startsWith(relocated + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.mp4': 'video/mp4',
        '.png': 'image/png',
        '.vtt': 'text/vtt',
      }[extname(path)] ?? 'application/octet-stream',
    );
    void serveArtifact(req, res, path).catch(() => {
      if (!res.headersSent) res.writeHead(404);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  let page;
  const errors = [];
  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).hostname !== '127.0.0.1') {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const { port } = server.address();
    await page.goto(`http://127.0.0.1:${port}/viewer/public/index.html`);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-viewer-state]')?.textContent ===
        'Report ready.',
    );
    const report = JSON.parse(
      await readFile(join(relocated, 'report.json'), 'utf8'),
    );
    assert.equal(await page.locator('h1').textContent(), report.title);
    const videoA = page.locator('[data-repro-video]'),
      videoB = page.locator('[data-repro-video-b]');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('video')].every(
        (v) => v.readyState >= 1 && v.videoWidth > 0,
      ),
    );
    assert.equal(await videoA.isVisible(), true);
    assert.equal(await videoB.isVisible(), true);
    assert.equal(
      await page
        .getByRole('button', { name: 'Show side by side' })
        .getAttribute('aria-pressed'),
      'true',
    );
    const beforeBounds = await videoA.boundingBox(),
      afterBounds = await videoB.boundingBox();
    assert.ok(
      beforeBounds.x + beforeBounds.width <= afterBounds.x + 1,
      'Comparison does not default to side by side',
    );
    assert.ok(Math.abs(beforeBounds.y - afterBounds.y) < 1);
    const layout = page.locator('[data-compare-layout]');
    for (const mode of ['onion', 'wipe', 'difference', 'edge']) {
      await layout.selectOption(mode);
      const a = await videoA.boundingBox(),
        b = await videoB.boundingBox();
      if (mode !== 'edge')
        assert.ok(
          Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1,
          `${mode} panes must overlap`,
        );
      else
        assert.ok(
          a.x + a.width <= b.x + 1,
          'Edge views preserve side-by-side context',
        );
      const style = await videoB.evaluate((video) => ({
        opacity: getComputedStyle(video).opacity,
        clip: getComputedStyle(video).clipPath,
        blend: getComputedStyle(video).mixBlendMode,
        filter: getComputedStyle(video).filter,
      }));
      if (mode === 'onion') assert.equal(style.opacity, '0.5');
      if (mode === 'wipe') assert.ok(style.clip.includes('50%'));
      if (mode === 'difference') assert.equal(style.blend, 'difference');
      if (mode === 'edge') assert.notEqual(style.filter, 'none');
    }
    await layout.selectOption('side-by-side');
    const independent = page.locator('[data-compare-independent]');
    await independent.check();
    await videoA.evaluate((video) => {
      video.currentTime = 1;
    });
    await videoB.evaluate((video) => {
      video.currentTime = 2;
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('video')].every((v) => !v.seeking),
    );
    assert.ok(
      Math.abs((await videoA.evaluate((v) => v.currentTime)) - 1) < 0.05,
    );
    assert.ok(
      Math.abs((await videoB.evaluate((v) => v.currentTime)) - 2) < 0.05,
    );
    assert.ok(await videoB.evaluate((v) => v.controls));
    await independent.uncheck();
    await videoA.evaluate((video) => {
      video.currentTime = 0;
    });

    await page.evaluate(() => {
      window.__reproTransport = [];
      for (const video of document.querySelectorAll('video'))
        for (const name of ['play', 'pause', 'error', 'keydown', 'keyup'])
          video.addEventListener(name, (event) => {
            window.__reproTransport.push({
              name,
              key: event.key,
              primary: video.hasAttribute('data-repro-video'),
              paused: video.paused,
              time: video.currentTime,
              prevented: event.defaultPrevented,
            });
          });
    });
    await videoA.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-repro-video]');
      return !video.paused && video.currentTime > 0.3;
    });
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () => document.querySelector('[data-repro-video]').paused,
    );
    assert.ok(
      await videoB.evaluate((video) => video.currentTime > 0),
      'Passive comparison frame did not follow playback',
    );
    const seekStart = await videoA.evaluate((video) => video.currentTime);
    await page.keyboard.press('ArrowRight');
    assert.ok(
      Math.abs(
        (await videoA.evaluate((video) => video.currentTime)) - seekStart - 5,
      ) < 0.1,
      'Keyboard seek was applied more than once',
    );
    for (const video of [videoA, videoB]) {
      const captions = await video.locator('track').getAttribute('src');
      assert.ok(captions?.includes('/assets/'));
      assert.equal((await page.request.get(captions)).status(), 200);
    }
    const manifest = JSON.parse(
      await readFile(join(relocated, 'evidence-manifest.json'), 'utf8'),
    );
    for (const still of await page.locator('[data-viewer-stills] img').all())
      await still.scrollIntoViewIfNeeded();
    await page.waitForFunction(
      (expected) =>
        [...document.querySelectorAll('[data-viewer-stills] img')].length ===
          expected &&
        [...document.querySelectorAll('[data-viewer-stills] img')].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      manifest.assets.filter((asset) => asset.kind === 'png').length,
    );
    for (const asset of manifest.assets.filter(
      (a) => a.kind === 'png' && a.title,
    )) {
      assert.ok(
        (await page.locator('[data-viewer-stills]').textContent()).includes(
          asset.title,
        ),
      );
    }
    await page.getByRole('button', { name: 'Show after side' }).click();
    assert.equal(await videoB.getAttribute('aria-hidden'), 'false');
    const scrubber = page.getByRole('slider', { name: 'Seek after evidence' });
    await scrubber.evaluate((input) => {
      input.value = '2500';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(
      () =>
        Math.abs(
          document.querySelector('[data-repro-video-b]').currentTime - 2.5,
        ) < 0.05,
    );
    const chapter = report.chapters[1];
    assert.ok(
      chapter?.variantTimeRanges?.after,
      'Actual after chapter time must be exported',
    );
    const marker = page.getByRole('button', {
      name: `Chapter: ${chapter.title}`,
      exact: true,
    });
    await marker.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (expected) =>
        !document.querySelector('[data-repro-video-b]').seeking &&
        document.querySelector('[data-repro-video-b]').readyState >= 2 &&
        Math.abs(
          document.querySelector('[data-repro-video-b]').currentTime * 1000 -
            expected,
        ) < 34,
      chapter.variantTimeRanges.after.start,
    );
    assert.ok(
      Math.abs(
        Number(await scrubber.inputValue()) -
          chapter.variantTimeRanges.after.start,
      ) < 34,
    );
    await videoB.focus();
    await page.keyboard.press('End');
    await page.waitForFunction(() => {
      const v = document.querySelector('[data-repro-video-b]');
      return Math.abs(v.currentTime - v.duration) < 0.1;
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('video')].every(
        (v) => Math.abs(v.currentTime - v.duration) < 0.1,
      ),
    );
    await page.keyboard.press('Home');
    await page.waitForFunction(
      () => document.querySelector('[data-repro-video-b]').currentTime === 0,
    );
    await page
      .getByRole('combobox', { name: 'Color theme' })
      .selectOption('high-contrast');
    assert.equal(
      await page.locator('html').getAttribute('data-theme'),
      'high-contrast',
    );
    await page.screenshot({
      path: join(output, 'portable-viewer.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    const result = {
      passed: true,
      relocated,
      viewerOverride: viewerBuild ?? null,
      checks: [
        'media decoded',
        'side-by-side default',
        'single keyboard transport action',
        'passive synchronized playback',
        'captions on both variants',
        'annotated images',
        'after keyboard seeking',
        'selected variant scrubber',
        'keyboard chapter navigation at recorded variant time',
        'high contrast',
        'no external requests',
      ],
    };
    await writeFile(
      join(output, 'portable-viewer.json'),
      JSON.stringify(result, null, 2),
    );
    return result;
  } catch (error) {
    const state = await page
      ?.evaluate(() => ({
        transport: window.__reproTransport,
        videos: [...document.querySelectorAll('video')].map((video) => ({
          paused: video.paused,
          currentTime: video.currentTime,
          readyState: video.readyState,
          error: video.error?.message,
          tabIndex: video.tabIndex,
        })),
      }))
      .catch(() => undefined);
    await writeFile(
      join(output, 'failure.json'),
      JSON.stringify({ error: String(error), errors, state }, null, 2),
    );
    await page
      ?.screenshot({ path: join(output, 'failure.png'), fullPage: true })
      .catch(() => undefined);
    throw error;
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log(
    JSON.stringify(
      await verifyPortableViewer(
        resolve(process.argv[2]),
        resolve(process.argv[3] ?? '.repro/ci/portable'),
        process.argv[4] ? resolve(process.argv[4]) : undefined,
      ),
    ),
  );
}
