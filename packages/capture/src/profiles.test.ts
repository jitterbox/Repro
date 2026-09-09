import type { Page } from 'playwright';
import { expect, it } from 'vitest';
import { verifyPageProfile } from './profiles.js';
const options = {
  profile: 'controlled' as const,
  viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  locale: 'en-US',
  timezone: 'UTC',
  blockServiceWorkers: true,
};
const observed = {
  ...options.viewport,
  locale: 'en-US',
  timezone: 'UTC',
  controlledByServiceWorker: false,
};
function page(values: Partial<typeof observed> = {}, workers: unknown[] = []) {
  return {
    evaluate: () => Promise.resolve({ ...observed, ...values }),
    context: () => ({ serviceWorkers: () => workers }),
  } as unknown as Page;
}
it('rejects an external project with a different pixel scale or controlled timezone', async () => {
  await expect(
    verifyPageProfile(page({ deviceScaleFactor: 2 }), options),
  ).rejects.toThrow('deviceScaleFactor');
  await expect(
    verifyPageProfile(page({ timezone: 'America/New_York' }), options),
  ).rejects.toThrow('timezone');
  await expect(verifyPageProfile(page(), options)).resolves.toBeUndefined();
});
it('rejects existing service workers in controlled capture but preserves faithful settings', async () => {
  await expect(verifyPageProfile(page({}, [{}]), options)).rejects.toThrow(
    'active service workers',
  );
  await expect(
    verifyPageProfile(page({ timezone: 'America/New_York' }, [{}]), {
      ...options,
      profile: 'faithful',
    }),
  ).resolves.toBeUndefined();
});
