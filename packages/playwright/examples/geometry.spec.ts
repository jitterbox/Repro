import { test, expect } from '@jitterbox/repro-playwright';
test('Content keeps its measured horizontal position after loading', async ({
  page,
  repro,
}) => {
  let originalX: number;
  const content = page.locator('#content');
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3194');
    repro.target('target', content);
    const bounds = await content.boundingBox();
    if (!bounds) throw new Error('Content has no initial bounds');
    originalX = bounds.x;
  });
  await repro.step('trigger', async () => {
    await page.getByRole('button', { name: 'Load' }).click();
    await expect(page.getByRole('heading')).toHaveText('Loaded');
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect
        .poll(async () => (await content.boundingBox())?.x, { timeout: 100 })
        .toBe(originalX),
    );
    await repro.checkpoint('result');
  });
});
