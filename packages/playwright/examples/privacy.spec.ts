import { test, expect } from '@jitterbox/repro-playwright';
import type { Page } from '@playwright/test';

test('Untouched private fields remain protected across motion, scroll and popup', async ({
  page,
  repro,
}) => {
  const checkpoint = async (id: string, selected: Page = page) => {
    repro.target(
      'private-field',
      selected.getByRole('textbox', { name: 'Private contact' }),
    );
    await repro.outcome(
      id,
      () =>
        expect(selected.getByRole('textbox')).toHaveValue(
          'moving.canary@example.test',
        ),
      selected,
    );
    // The stationary interval is intentional: verify untouched source pixels,
    // not only a screenshot acquired after masking was discovered.
    await selected.waitForTimeout(250);
    await repro.checkpoint(id, selected);
  };
  await repro.step('prepare', async () => {
    await page.goto('http://127.0.0.1:3196');
    await checkpoint('untouched');
  });
  await repro.step('move', async () => {
    await page.getByRole('button', { name: 'Move field' }).click();
    await expect(page.getByRole('textbox')).toHaveCSS('left', '500px');
    await checkpoint('moved');
  });
  await repro.step('scroll', async () => {
    await page.getByRole('button', { name: 'Scroll field' }).click();
    await checkpoint('scrolled');
  });
  await repro.step('popup', async () => {
    const opened = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open popup' }).click();
    const popup = await opened;
    await repro.ready(popup);
    await checkpoint('popup', popup);
  });
});
