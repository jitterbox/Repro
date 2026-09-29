import { test, expect } from '@repro/playwright';
test('Notification preference persists after a three-action menu sequence', async ({
  page,
  repro,
}) => {
  await repro.step('prepare', async () => {
    await page.goto(process.env.REPRO_URL ?? 'http://127.0.0.1:3207/menu');
    repro.target('target', page.locator('#target'));
  });
  await repro.step('workspace', async () => {
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await repro.checkpoint('workspace-open');
  });
  await repro.step('preferences', async () => {
    await page
      .getByRole('button', { name: 'Preferences', exact: true })
      .click();
    await repro.checkpoint('preferences-open');
  });
  await repro.step('notifications', async () => {
    await page
      .getByRole('button', { name: 'Notifications', exact: true })
      .click();
  });
  await repro.step('verify', async () => {
    await repro.outcome('result', () =>
      expect(page.locator('#target')).toHaveText('Notifications: Disabled', {
        timeout: 150,
      }),
    );
    await repro.checkpoint('result');
  });
});
