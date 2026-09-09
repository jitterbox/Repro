import { test, expect } from '@repro/playwright';
test('Content remains visible through the entire loading interval', async ({
  page,
  repro,
}) => {
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3196');
    repro.target('target', page.locator('#content'));
  });
  await repro.step('trigger', async () => {
    await repro.segment('loading', async () => {
      await page.getByRole('button', { name: 'Load' }).click();
      await expect(page.getByRole('heading')).toHaveText('Loaded');
    });
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect
        .poll(
          () =>
            page.evaluate(
              () => (window as unknown as { hadFlash: boolean }).hadFlash,
            ),
          { timeout: 100 },
        )
        .toBe(false),
    );
    await repro.checkpoint('result');
  });
});
