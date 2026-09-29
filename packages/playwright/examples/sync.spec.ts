import { test, expect } from '@jitterbox/repro-playwright';

test('Uneven sequence retains each semantic checkpoint in comparison', async ({
  page,
  repro,
}) => {
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3195');
    repro.target('state', page.getByTestId('state'));
  });
  for (const [id, button, color] of [
    ['blue', 'Begin', 'rgb(0, 0, 255)'],
    ['green', 'Continue', 'rgb(0, 255, 0)'],
    ['red', 'Finish', 'rgb(255, 0, 0)'],
  ] as const) {
    await repro.step(id, async () => {
      await page.getByRole('button', { name: button, exact: true }).click();
      await repro.check(id, `The ${id} state is visible`, () =>
        expect(page.getByTestId('state')).toHaveCSS('background-color', color),
      );
      await repro.checkpoint(id);
    });
  }
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect(page.getByRole('heading')).toHaveText('Complete', {
        timeout: 100,
      }),
    );
    await repro.checkpoint('result');
  });
});
