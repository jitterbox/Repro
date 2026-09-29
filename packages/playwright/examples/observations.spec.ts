import { test, expect } from '@jitterbox/repro-playwright';
test('Checkout status appears and disappears with response evidence', async ({
  page,
  repro,
}) => {
  const target = repro.target('status', page.locator('.status'));
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3191');
    await repro.visibility('initial', 'status');
  });
  await repro.step('trigger', async () => {
    const response = page.waitForResponse('**/checkout?**');
    await page.getByRole('button', { name: 'Checkout', exact: true }).click();
    await repro.network('result', await response);
    await expect(target).toBeVisible();
  });
  await repro.step('verify', async () => {
    await repro.visibility('result', 'status');
    await repro.outcome('result', () =>
      expect(target).toHaveText('Checkout ready', { timeout: 100 }),
    );
    await repro.checkpoint('result');
  });
  await repro.step('hide', async () => {
    await page.getByRole('button', { name: 'Hide status' }).click();
    await repro.visibility('hidden', 'status');
  });
  await repro.step('duplicate', async () => {
    await page.getByRole('button', { name: 'Duplicate status' }).click();
    await repro.visibility('ambiguous', 'status');
  });
  await repro.step('remove', async () => {
    await page.getByRole('button', { name: 'Remove status' }).click();
    await repro.visibility('absent', 'status');
  });
});
