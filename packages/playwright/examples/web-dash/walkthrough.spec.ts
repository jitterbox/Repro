import { expect, humanPointer } from '@repro/playwright';
import { test } from './auth.js';

// These are real Web-Dash controls. No route interception, HTML replacement,
// injected application state, forced clicks, or writes to business records.
test('Record a real Web-Dash workflow', async ({ page, repro }) => {
  const origin = process.env.REPRO_WEBDASH_URL ?? 'http://localhost:4200';
  const kind = process.env.REPRO_WEBDASH_DEMO ?? 'sales-calendar';
  const pointer = humanPointer(page);
  const pause = () => page.waitForTimeout(1800);
  const state = () => ({
    route: location.pathname,
    width: innerWidth,
    calendarOpen: !!document.querySelector('mat-datepicker-content'),
    settingsOpen: !!document.querySelector('app-settings'),
    visibleCheckTypes: document.querySelectorAll(
      'app-select-check-type .list-item',
    ).length,
  });
  await repro.step('prepare', async () => {
    await page.goto(`${origin}/dashboard`);
    await expect(page.getByText('My dashboard', { exact: true })).toBeVisible();
    await pause();
    await repro.observe('page', state);
  });
  const stop = repro.watch('page', state, { intervalMs: 250 });
  await repro.step('menu', async () => {
    await pointer.click(
      page.getByRole('button', { name: 'Toggle menu', exact: true }),
    );
    await expect(page.locator('mat-sidenav[position="start"]')).toBeVisible();
    await pause();
  });
  await repro.step('destination', async () => {
    const label = kind === 'mobile-checks' ? /^Checks$/i : /^Sales$/i;
    await pointer.click(
      page
        .locator('mat-sidenav[position="start"]')
        .getByRole('button', { name: label }),
    );
    await expect(
      page.locator(
        kind === 'mobile-checks' ? 'app-select-check-type' : 'app-sales',
      ),
    ).toBeVisible();
    await pause();
  });
  await repro.step('inspect', async () => {
    if (kind === 'sales-calendar') {
      const calendar = page
        .locator('app-sales app-date-picker-shell')
        .getByLabel('Open calendar');
      await expect(calendar).toHaveCount(1);
      await pointer.click(calendar);
      const target = repro.target(
        'detail',
        page.locator('mat-datepicker-content'),
      );
      await expect(target).toBeVisible();
    } else if (kind === 'mobile-checks') {
      const search = page.locator('app-select-check-type input');
      await expect(search).toHaveCount(1);
      await pointer.click(
        page
          .locator('app-select-check-type')
          .getByText('Search for a check', { exact: true }),
      );
      await expect(search).toBeFocused();
      await search.pressSequentially('DM', { delay: 130 });
      const target = repro.target(
        'detail',
        page.locator('app-select-check-type .check-list'),
      );
      await expect(target.locator('.list-item')).not.toHaveCount(0);
      await expect(
        target.locator('.list-item').filter({ hasNotText: /DM/i }),
      ).toHaveCount(0);
    } else if (kind === 'settings-panel') {
      await pointer.click(
        page.getByRole('button', { name: 'Settings', exact: true }),
      );
      const target = repro.target(
        'detail',
        page.locator('[tourAnchor="dashboard-settings-theme"]'),
      );
      await expect(target).toBeVisible();
      await expect(
        page.getByRole('radio', { name: /Dark mode/i }),
      ).toBeVisible();
    } else throw new Error(`Unknown walkthrough ${kind}`);
    await pause();
  });
  await repro.step('verify', async () => {
    await repro.observe('page', state);
    await repro.observe('navigationTiming', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as
        PerformanceNavigationTiming | undefined;
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      };
    });
    await repro.outcome('result', async () => {
      const target = repro.targets.get('detail');
      if (!target) throw new Error('Measured application target is missing');
      await expect(target).toBeVisible();
      await expect(page).toHaveURL(
        kind === 'mobile-checks'
          ? /\/checks\/create\/select-check-type/
          : /\/sales/,
      );
    });
    await repro.checkpoint('result');
    await pause();
  });
  await stop();
});
