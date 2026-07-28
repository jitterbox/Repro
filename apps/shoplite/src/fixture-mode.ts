export type FixtureMode = 'broken' | 'fixed';

const STORAGE_KEY = 'reproFixture';

export function resolveFixtureMode(): FixtureMode {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('fixture');
  if (fromQuery === 'broken' || fromQuery === 'fixed') {
    return fromQuery;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'broken' || stored === 'fixed') {
      return stored;
    }
  } catch {
    // ignore storage failures
  }

  return 'broken';
}

export function applyFixtureMode(mode: FixtureMode): void {
  document.documentElement.dataset.reproFixture = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function isBroken(): boolean {
  return document.documentElement.dataset.reproFixture === 'broken';
}
