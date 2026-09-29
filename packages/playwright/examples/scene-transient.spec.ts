import { test, expect } from '@jitterbox/repro-playwright';
test('Account details remain visible throughout loading', async ({
  page,
  repro,
}) => {
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3207/transient');
    repro.target('target', page.locator('#target'));
  });
  await repro.step('trigger', async () => {
    await repro.segment('loading', async () => {
      await page.getByRole('button', { name: 'Load account' }).click();
      await expect(page.locator('#status')).toHaveText('Account loaded');
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
          { timeout: 150 },
        )
        .toBe(false),
    );
    await repro.checkpoint('result');
  });
});
