import { test, expect } from '@repro/playwright';
test('Measured interaction remains explicit across absence, scrolling and frames', async ({
  page,
  repro,
}) => {
  const url = process.env.REPRO_URL ?? 'http://127.0.0.1:3193?case=passthrough';
  const mode = new URL(url).searchParams.get('case');
  const target =
    mode === 'frame'
      ? page
          .frameLocator('iframe')
          .getByRole('button', { name: 'Checkout', exact: true })
      : page.getByRole('button', { name: 'Checkout', exact: true });
  await repro.step('prepare', async () => {
    await page.goto(url);
    repro.target('target', target);
  });
  await repro.step('trigger', async () => {
    if (mode === 'absent') {
      await page.reload();
      return;
    }
    await target.scrollIntoViewIfNeeded();
    await repro.hitTest('result', 'target');
    const bounds = await target.boundingBox();
    if (!bounds) throw new Error('Target bounds unavailable');
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      mode === 'absent'
        ? expect(target).toBeVisible({ timeout: 100 })
        : expect(page.getByRole('heading')).toHaveText('Checkout', {
            timeout: 100,
          }),
    );
    await repro.checkpoint('result');
  });
});
