import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test as base } from '@repro/playwright';

/** Authenticate before Repro starts its screencast, trace or diagnostics. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const origin = process.env.REPRO_WEBDASH_URL ?? 'http://localhost:4200';
    const checkout =
      process.env.REPRO_WEBDASH_CHECKOUT ?? '/home/cory/repos/Web-Dash';
    const role = process.env.REPRO_WEBDASH_ROLE ?? 'DM';
    try {
      const response = await page.request.get(`${origin}/api/auth/csrf`, {
        timeout: 15000,
      });
      if (!response.ok()) throw new Error('API unavailable');
    } catch {
      throw new Error(
        'Web-Dash API is unavailable. Restore its documented API/VPN connection; mocks are not permitted for these recordings.',
      );
    }
    try {
      const local = JSON.parse(
        await readFile(
          join(checkout, 'dev-login.credentials.local.json'),
          'utf8',
        ),
      ) as {
        accounts?: { role: string; username?: string; password?: string }[];
      };
      const account = local.accounts?.find(
        (candidate: { role: string }) =>
          candidate.role.toLowerCase() === role.toLowerCase(),
      );
      if (
        typeof account?.username !== 'string' ||
        typeof account.password !== 'string' ||
        !account.username ||
        !account.password
      )
        throw new Error('Missing local role');
      await page.goto(`${origin}/dev-login`);
      await page.locator('#username').fill(account.username);
      await page.locator('#pin').fill(account.password);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.waitForURL('**/dashboard**', { timeout: 45000 });
      // Credentials stay in memory. Do not save cookies/storageState or log errors
      // from credential-bearing Playwright calls (their call logs may contain input).
      await page.goto('about:blank');
    } catch {
      throw new Error(
        `Local Web-Dash login for role ${role} did not complete; no capture was started. Check the local credentials and API connection.`,
      );
    }
    await use(page);
  },
});
