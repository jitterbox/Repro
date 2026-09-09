import { test, expect } from '@repro/playwright';

test('Ordinary prerequisites cannot manufacture a verified outcome', async ({
  page,
  repro,
}) => {
  const url = process.env.REPRO_URL ?? 'http://127.0.0.1:3198?fixed=1';
  const rejectGuard = new URL(url).searchParams.has('fail-guard');
  await repro.step('prepare', async () => {
    await page.goto(url);
    await repro
      .check('ready', 'Cart is loaded', () =>
        expect(page.getByRole('heading')).toHaveText(
          rejectGuard ? 'Deliberate incorrect prerequisite' : 'Cart',
          { timeout: 100 },
        ),
      )
      .catch((error: unknown) => {
        // Deliberately swallow only in the negative control. Recorded failure
        // must still block successful evidence despite a later passing outcome.
        if (!rejectGuard) throw error;
      });
    await repro.checkpoint('ready');
  });
  await repro.step('trigger', async () => {
    await page.getByRole('button', { name: 'Checkout' }).click();
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect(page.getByRole('heading')).toHaveText('Checkout'),
    );
    await repro.checkpoint('result');
  });
});
