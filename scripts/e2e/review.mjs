/** Public review CLI over real captures; uncertainty cases modify metadata only. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const source = JSON.parse(
  await readFile(
    resolve(process.argv[2] ?? '.repro/synchronization/acceptance.json'),
    'utf8',
  ),
);
const output = resolve(
  process.env.REPRO_REVIEW_OUT ?? '.repro/review-acceptance',
);
await mkdir(output, { recursive: true });
const uncertain = join(output, 'synthetic-uncertain-after');
await cp(source.after, uncertain, { recursive: true });
const manifestPath = join(uncertain, 'run.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const shot = manifest.observations.find((o) => o.kind === 'screenshot');
shot.endMs = shot.timeMs + 250;
manifest.observations = manifest.observations.filter(
  (o) => !(o.kind === 'screenshot' && o.checkpoint === 'green'),
);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const relocated = join(output, 'relocated-recording-after');
await cp(source.after, relocated, { recursive: true });
const movedManifest = JSON.parse(
  await readFile(join(relocated, 'run.json'), 'utf8'),
);
const recording = movedManifest.artifacts.find(
  (artifact) => artifact.kind === 'recording',
);
await mkdir(join(relocated, 'media'), { recursive: true });
await rename(
  join(relocated, recording.path),
  join(relocated, 'media/recording.mp4'),
);
recording.path = 'media/recording.mp4';
await writeFile(
  join(relocated, 'run.json'),
  JSON.stringify(movedManifest, null, 2),
);
const empty = join(output, 'synthetic-no-checkpoints-after');
await cp(source.after, empty, { recursive: true });
const emptyManifest = JSON.parse(
  await readFile(join(empty, 'run.json'), 'utf8'),
);
emptyManifest.observations = emptyManifest.observations.filter(
  (o) => o.kind !== 'screenshot',
);
await writeFile(
  join(empty, 'run.json'),
  JSON.stringify(emptyManifest, null, 2),
);

const fallback = join(output, 'synthetic-renamed-checkpoint-after');
await cp(source.after, fallback, { recursive: true });
const fallbackManifest = JSON.parse(
  await readFile(join(fallback, 'run.json'), 'utf8'),
);
for (const observation of fallbackManifest.observations)
  if (observation.checkpoint === 'green')
    observation.checkpoint = 'renamed-green';
await writeFile(join(fallback, 'run.json'), JSON.stringify(fallbackManifest));

async function startReview(after) {
  const child = spawn(
    process.execPath,
    [
      resolve('packages/cli/dist/bin.js'),
      'review',
      after,
      '--baseline',
      source.before,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Review startup timed out'));
    }, 20000);
    let text = '',
      errors = '';
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Review exited ${code}: ${errors}`));
    });
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (!text.includes('\n')) return;
      try {
        const parsed = JSON.parse(text);
        clearTimeout(timeout);
        resolve(parsed.url);
      } catch {
        /* Wait for the complete JSON line. */
      }
    });
  });
  return {
    url,
    close: () =>
      new Promise((resolve) => {
        child.once('exit', resolve);
        child.kill();
      }),
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [name, directory] of [
    ['verified', relocated],
    ['uncertain', uncertain],
    ['empty', empty],
    ['fallback', fallback],
  ]) {
    const server = await startReview(directory);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(server.url);
      await page.waitForFunction(() =>
        [...document.querySelectorAll('video')].every((v) => v.readyState >= 1),
      );
      const original = page.getByLabel('Original timing');
      assert.equal(await original.isChecked(), name !== 'verified');
      assert.equal(await original.isDisabled(), name === 'empty');
      assert.match(
        await page.locator('#summary').textContent(),
        /seconds original/,
      );
      assert.match(
        await page.locator('#checkpoint-timing').textContent(),
        /uncertainty/,
      );
      assert.match(
        await page.locator('#alignment').textContent(),
        name === 'verified' ? /proof verified/ : /proof not verified/,
      );
      if (name === 'uncertain') {
        assert.match(
          await page.locator('#alignment-notes').textContent(),
          /Unmatched before checkpoint: green/,
        );
        assert.match(
          await page.locator('#checkpoint-timing').textContent(),
          /uncertainty 250\.0 ms/,
        );
        await page
          .getByRole('button', { name: /Inspect uncertain alignment/ })
          .click();
        await original.uncheck();
        await page.waitForFunction(() =>
          document
            .querySelector('#timing')
            .textContent.includes('uncertain alignment'),
        );
        await page.screenshot({
          path: join(output, 'uncertain.png'),
          fullPage: true,
        });
      }
      if (name === 'fallback') {
        assert.match(
          await page.locator('#alignment-notes').textContent(),
          /Estimated image alignment: green → renamed-green/,
        );
        const comparison = JSON.parse(
          await readFile(join(fallback, 'comparison.json'), 'utf8'),
        );
        assert.equal(comparison.ok, false);
        assert.equal(comparison.imageMatches.length, 1);
        assert.equal(
          comparison.composition.sync.strategy,
          'anchors-with-image-fallback',
        );
        assert.ok(comparison.composition.sync.knots.some((k) => k[3] === 0.5));
        await original.uncheck();
      }
      await page
        .getByRole('button', { name: 'Play / pause recording' })
        .click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('video')].every(
          (v) => !v.paused && v.currentTime > 0,
        ),
      );
      if (name === 'empty')
        await page
          .getByRole('button', { name: 'Play / pause recording' })
          .click();
      else
        await page
          .locator('video')
          .first()
          .evaluate((v) => v.pause());
      await page.waitForFunction(() =>
        [...document.querySelectorAll('video')].every((v) => v.paused),
      );
      if (name !== 'empty') await original.check();
      assert.deepEqual(
        await page
          .locator('video')
          .evaluateAll((videos) => videos.map((v) => v.playbackRate)),
        [1, 1],
      );
      // Original timing permits independent native seeking; no synchronization loop may undo it.
      await page
        .locator('video')
        .first()
        .evaluate((v) => {
          v.currentTime = 0.2;
        });
      await page
        .locator('video')
        .nth(1)
        .evaluate((v) => {
          v.currentTime = 0.7;
        });
      await page.waitForFunction(() => {
        const [a, b] = document.querySelectorAll('video');
        return !a.seeking && !b.seeking;
      });
      await page.waitForTimeout(150);
      assert.ok(
        Math.abs(
          (await page
            .locator('video')
            .nth(1)
            .evaluate((v) => v.currentTime)) - 0.7,
        ) < 0.01,
      );
      assert.deepEqual(errors, []);
      results.push({
        name,
        url: server.url,
        alignment: await page.locator('#alignment').textContent(),
        timing: await page.locator('#timing').textContent(),
      });
    } catch (error) {
      await page
        .screenshot({
          path: join(output, `${name}-failure.png`),
          fullPage: true,
        })
        .catch(() => {});
      await writeFile(
        join(output, `${name}-failure.json`),
        JSON.stringify({ error: String(error), errors }, null, 2),
      );
      throw error;
    } finally {
      await page.close();
      await server.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  join(output, 'acceptance.json'),
  JSON.stringify(
    {
      passed: true,
      source: process.argv[2],
      syntheticControl: uncertain,
      results,
    },
    null,
    2,
  ),
);
console.log(`Review acceptance passed: ${join(output, 'acceptance.json')}`);
