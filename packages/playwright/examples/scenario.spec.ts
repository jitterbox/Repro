import { test, expect } from '@jitterbox/repro-playwright';
test('Transparent interceptor before and after proof', async ({
  page,
  repro,
}) => {
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3198');
    repro.target(
      'target',
      page.getByRole('button', { name: 'Checkout', exact: true }),
    );
  });
  await repro.step('trigger', async () => {
    await repro.hitTest('result', 'target');
    await page.mouse.click(170, 110);
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect(page.getByRole('heading')).toHaveText('Checkout', {
        timeout: 300,
      }),
    );
    await repro.checkpoint('result');
  });
});
