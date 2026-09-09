import { test, expect } from '@repro/playwright';

// The assessment supplies intent; executable locator bindings come from inspecting the app.
test('Discovery claim: Checkout accepts its intended pointer action', async ({
  page,
  repro,
}) => {
  const checkout = page.getByRole('button', { name: 'Checkout', exact: true });
  await repro.step('step-1', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3198');
    repro.target('target', checkout);
    await expect(checkout).toBeVisible();
  });
  await repro.step('step-2', async () => {
    await repro.hitTest('result', 'target');
    const bounds = await checkout.boundingBox();
    if (!bounds) throw new Error('Checkout has no measured pointer target');
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
  });
  await repro.step('verify-result', async () => {
    await repro.outcome('result', () =>
      expect(page.getByRole('heading')).toHaveText('Checkout', {
        timeout: 300,
      }),
    );
    await repro.checkpoint('result');
  });
});
