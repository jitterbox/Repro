import { test, expect, humanPointer } from '@jitterbox/repro-playwright';
test('Demonstrate and measure the selected application defect', async ({
  page,
  repro,
}) => {
  const url = process.env.REPRO_URL ?? 'http://127.0.0.1:3208/overflow';
  const pointer = humanPointer(page);
  const kind = new URL(url).pathname.slice(1);
  const read = () =>
    (window as unknown as { fixture: () => Record<string, unknown> }).fixture();
  await repro.step('prepare', async () => {
    await page.goto(url);
    repro.target('target', page.locator('#target'));
    if (['overflow', 'alignment'].includes(kind))
      repro.target('reference', page.locator('#reference'));
    await repro.observe('application', read);
    await repro.observe('vitals', () => {
      const entry = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      return {
        loadMs: entry?.domContentLoadedEventEnd ?? null,
        transferBytes: entry?.transferSize ?? null,
      };
    });
  });
  const stop = repro.watch('application', read, { intervalMs: 75 });
  await repro.step('open', async () => {
    await pointer.click(page.locator('#open'));
    await page.waitForTimeout(1600);
  });
  await repro.step('action', async () => {
    await pointer.approach(page.locator('#action'));
    await repro.segment('interaction', async () => {
      await pointer.click(page.locator('#action'));
      if (['sticky', 'footer', 'chrome'].includes(kind)) {
        const box = await page.locator('#scroll').boundingBox();
        if (!box) throw new Error('Missing scroller');
        await pointer.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 8; i++) {
          await page.mouse.wheel(0, kind === 'footer' ? 160 : 25);
          await page.waitForTimeout(60);
        }
      }
      if (kind === 'scroll') {
        await pointer.move(180, 450);
        await page.mouse.wheel(0, 160);
        await page.waitForTimeout(200);
      }
      if (kind === 'typing') {
        await page
          .locator('#target')
          .pressSequentially('Temperature 74.5', { delay: 65 });
        await repro.observe('buttonBeforeBlur', read);
        await pointer.click(page.locator('#submit'));
      }
      if (kind === 'layers') {
        const r = await page.locator('#blocked').boundingBox();
        if (r) {
          await pointer.move(r.x + r.width / 2, r.y + r.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(85);
          await page.mouse.up();
        }
      }
      if (kind === 'orientation')
        await pointer.click(page.locator('#caret'), { force: true });
      if (kind === 'gestures') {
        const box = await page.locator('#target').boundingBox();
        if (!box) throw new Error('Missing gesture target');
        await pointer.click(page.locator('#target'), { double: true });
        await page.waitForTimeout(450);
        await pointer.click(page.locator('#target'), { button: 'right' });
        await page.waitForTimeout(450);
        await pointer.move(box.x + 40, box.y + 100);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.up();
        await pointer.move(box.x + 50, box.y + 120);
        await page.mouse.down();
        await pointer.move(box.x + 250, box.y + 120, 800);
        await page.mouse.up();
      }
      if (kind === 'gallery') {
        const r = await page.locator('#target').boundingBox();
        if (!r) throw new Error('Missing gallery');
        await pointer.move(r.x + r.width - 20, r.y + 100);
        await page.mouse.down();
        await pointer.move(r.x + 20, r.y + 100, 800);
        await page.waitForTimeout(200);
        await page.mouse.up();
      }
      await page.waitForTimeout(300);
    });
    await page.waitForTimeout(1600);
  });
  await repro.step('finish', async () => {
    if (kind === 'gallery') {
      await pointer.click(page.locator('#search'));
      await page.locator('#search').pressSequentially('zzzzz', { delay: 120 });
      await page.waitForTimeout(1000);
    }
    if (kind !== 'flash') await pointer.click(page.locator('#finish'));
    await page.waitForTimeout(1600);
    await repro.observe('application', read);
    if (kind === 'gestures') await repro.checkpoint('sequence');
  });
  await stop();
  await repro.step('verify', async () => {
    const actual = await repro.observe('actual', read);
    if (kind === 'dark') expect(actual.text).toBe('rgb(213, 245, 220)');
    await repro.observe('vitals', () => {
      const entry = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      return {
        loadMs: entry?.domContentLoadedEventEnd ?? null,
        transferBytes: entry?.transferSize ?? null,
      };
    });
    await repro.outcome('result', () =>
      expect
        .poll(async () => (await page.evaluate(read)).valid, { timeout: 100 })
        .toBe(true),
    );
    await repro.checkpoint('result');
  });
});
