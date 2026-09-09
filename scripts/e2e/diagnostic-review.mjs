/** Inspect measured hit-test images through the public review CLI. No capture is fabricated. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
export async function verifyDiagnosticReview(directory, output) {
  await mkdir(output, { recursive: true });
  const run = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  const sample = run.observations.find(
    (o) => o.kind === 'hit-test' && o.artifact,
  );
  assert.ok(sample, 'Captured sample PNG missing');
  const child = spawn(
    process.execPath,
    [resolve('packages/cli/dist/bin.js'), 'review', directory],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Review did not start')),
        20000,
      );
      let text = '';
      child.stdout.on('data', (chunk) => {
        text += chunk;
        const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Review exited ${code}`));
      });
    });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.locator('#diagnostic-samples button').first().click();
    const image = page.locator('.surface img').first();
    await image.evaluate((img) => img.decode());
    assert.ok((await image.getAttribute('src')).endsWith(sample.artifact));
    if (sample.data.diagnosticFrame.aligned) {
      const outline = page.locator('.diagnostic');
      assert.equal(await outline.count(), 1);
      assert.equal(await outline.getAttribute('title'), sample.id);
      assert.ok((await outline.textContent()).includes('Sampled recipient'));
      const imageBox = await image.boundingBox(),
        box = await outline.boundingBox();
      const expected = sample.data.stack[0].bounds,
        scale = imageBox.width / run.environment.viewport.width;
      assert.ok(Math.abs(box.x - imageBox.x - expected.x * scale) < 1);
      assert.ok(Math.abs(box.y - imageBox.y - expected.y * scale) < 1);
      assert.ok(
        (await page.locator('#checkpoint-timing').textContent()).includes(
          'Bracketed diagnostic',
        ),
      );
    } else {
      assert.equal(await page.locator('.diagnostic').count(), 0);
      assert.ok(
        (await page.locator('#checkpoint-timing').textContent()).includes(
          'unavailable',
        ),
      );
    }
    await page.screenshot({
      path: join(output, 'diagnostic-review.png'),
      fullPage: true,
    });
    await page.locator('#checkpoints button').first().click();
    assert.equal(
      await page.locator('.diagnostic').count(),
      0,
      'Sample geometry must not attach to another image',
    );
    assert.deepEqual(errors, []);
    const result = {
      passed: true,
      observation: sample.id,
      aligned: sample.data.diagnosticFrame.aligned,
    };
    await writeFile(
      join(output, 'diagnostic-review.json'),
      JSON.stringify(result, null, 2),
    );
    return result;
  } finally {
    await browser?.close();
    child.kill();
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  console.log(
    JSON.stringify(
      await verifyDiagnosticReview(
        resolve(process.argv[2]),
        resolve(process.argv[3]),
      ),
    ),
  );
