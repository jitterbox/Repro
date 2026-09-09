import { test, expect } from '@repro/playwright';

test('Stationary intervals and a brief color change retain their real timing', async ({
  page,
  repro,
}) => {
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3198');
    await page.setContent('<body style="background:rgb(255,0,0)"></body>');
    await page.waitForTimeout(500);
  });
  await repro.step('blue', async () => {
    await page.evaluate(() => {
      document.body.style.background = 'rgb(0,0,255)';
    });
    await page.waitForTimeout(1000);
  });
  await repro.step('pulse', async () => {
    await page.evaluate(() => {
      document.body.style.background = 'rgb(0,255,0)';
    });
    await page.waitForTimeout(250);
  });
  await repro.step('end', async () => {
    await page.evaluate(() => {
      document.body.style.background = 'rgb(255,0,0)';
    });
    await page.waitForTimeout(1000);
    await repro.outcome('result', () =>
      expect(page.locator('body')).toHaveCSS(
        'background-color',
        'rgb(255, 0, 0)',
      ),
    );
    await repro.checkpoint('result');
  });
});
