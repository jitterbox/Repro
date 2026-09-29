import { test, expect } from '@jitterbox/repro-playwright';
test('Checkout request failures are correlated with captured evidence', async ({
  page,
  repro,
}) => {
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3197');
  });
  await repro.step('trigger', async () => {
    await page.getByRole('button', { name: 'Checkout' }).click();
    await expect(page.getByRole('heading')).not.toHaveText('Cart');
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect(page.getByRole('heading')).toHaveText('Checkout', {
        timeout: 100,
      }),
    );
    await repro.checkpoint('result');
  });
});
