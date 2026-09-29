import { test, expect } from '@jitterbox/repro-playwright';
test('Invoice total aligns with its reference after refresh', async ({
  page,
  repro,
}) => {
  let referenceX = 0;
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3207/geometry');
    repro.target('target', page.locator('#target'));
    repro.target('reference', page.locator('#reference'));
    const bounds = await page.locator('#reference').boundingBox();
    if (!bounds) throw new Error('Missing reference bounds');
    referenceX = bounds.x;
  });
  await repro.step('trigger', async () => {
    await page.getByRole('button', { name: 'Refresh invoice' }).click();
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect
        .poll(async () => (await page.locator('#target').boundingBox())?.x, {
          timeout: 150,
        })
        .toBe(referenceX),
    );
    await repro.checkpoint('result');
  });
});
