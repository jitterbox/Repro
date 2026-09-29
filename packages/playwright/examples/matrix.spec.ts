import { test, expect } from '@jitterbox/repro-playwright';
import type { Page } from '@playwright/test';

test('Evidence strategy matrix', async ({ page, repro }) => {
  const url = process.env.REPRO_URL;
  if (!url) throw new Error('Missing matrix URL');
  const kind = new URL(url).searchParams.get('case') ?? 'interaction';
  const trigger = page.getByTestId('lab-trigger');
  const result = page.getByTestId('lab-result');
  let proofPage: Page = page;
  let initialX = 0;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await repro.step('prepare', async () => {
    await page.goto(url);
    await expect(trigger).toBeVisible();
    repro.target('affected', result);
    repro.target('action', trigger);
    initialX = (await result.boundingBox())?.x ?? 0;
    await repro.check('context', 'Ready before the natural action', () =>
      expect(result).toHaveText('Ready'),
    );
    await repro.checkpoint('context');
    // A readable ready interval also supplies stable background pixels for renderer stress tests.
    await page.waitForTimeout(1200);
    if (kind === 'appearance') await repro.visibility('result', 'affected');
  });
  await repro.step('trigger', async () => {
    if (kind === 'interaction') await repro.hitTest('result', 'action');
    if (kind === 'keyboard') {
      await trigger.focus();
      await page.keyboard.press('Tab');
      return;
    }
    const popup = kind === 'multipage' ? page.waitForEvent('popup') : undefined;
    const response =
      kind === 'network'
        ? page.waitForResponse((r) => r.url().includes('evidence'))
        : undefined;
    const action = async () => {
      const bounds = await trigger.boundingBox();
      if (!bounds) throw new Error('Missing action bounds');
      await page.mouse.click(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      if (kind === 'transient') await page.waitForTimeout(350); // Observe recovery; never wait before trigger.
    };
    if (kind === 'transient' || kind === 'performance')
      await repro.segment('critical', action);
    else await action();
    if (popup) {
      proofPage = await popup;
      await proofPage.waitForLoadState();
    }
    if (response) await repro.network('result', await response);
  });
  await repro.step('verify', async () => {
    if (kind === 'appearance') await repro.visibility('result', 'affected');
    if (kind === 'accessibility') await repro.accessibility('result');
    await repro.outcome(
      'result',
      async () => {
        if (kind === 'interaction')
          await expect(result).toHaveText('Completed', { timeout: 300 });
        else if (kind === 'text') {
          await expect(result).toHaveCSS('overflow', 'hidden');
          await expect(result).toHaveCSS('text-overflow', 'ellipsis');
          expect(
            await result.evaluate((el) => el.scrollWidth > el.clientWidth),
          ).toBe(true);
        } else if (kind === 'geometry')
          expect((await result.boundingBox())?.x).toBe(initialX);
        else if (kind === 'appearance')
          await expect(result).toBeVisible({ timeout: 300 });
        else if (kind === 'console') {
          expect(errors.filter((e) => e.includes('LAB-CONSOLE'))).toHaveLength(
            0,
          );
          await expect(result).toHaveText('Completed');
        } else if (kind === 'keyboard')
          await expect(page.getByTestId('lab-next')).toBeFocused();
        else if (kind === 'accessibility')
          await expect(trigger).toHaveAccessibleName('Run check');
        else if (kind === 'multipage')
          await expect(proofPage.getByTestId('lab-total')).toHaveText('84.50');
        else if (kind === 'privacy')
          await expect(page.getByTestId('lab-private')).toHaveValue('••••••');
        else if (kind === 'network')
          await expect(result).toHaveText('Response accepted', {
            timeout: 1000,
          });
        else if (kind === 'performance')
          expect(
            Number(await result.getAttribute('data-duration')),
          ).toBeLessThan(200);
        else if (kind === 'transient') {
          // Browser paint samples, not fixture-mode inspection, prove whether red appeared.
          const samples = await page.evaluate(
            () =>
              (window as unknown as { labColors?: string[] }).labColors ?? [],
          );
          expect(samples.some((color) => color === 'rgb(230, 0, 0)')).toBe(
            false,
          );
          expect(samples.length).toBeGreaterThan(0);
        }
      },
      proofPage,
    );
    await repro.checkpoint('result', proofPage);
  });
});
