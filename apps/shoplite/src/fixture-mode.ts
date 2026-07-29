export type FixtureMode = 'broken' | 'fixed';

const STORAGE_KEY = 'reproFixture';
const BUG_PATTERN = /^BUG-\d{4}$/u;

export function resolveActiveBug(): string | null {
  const params = new URLSearchParams(window.location.search);
  const bug = params.get('bug');
  if (bug !== null && BUG_PATTERN.test(bug)) {
    return bug;
  }
  return null;
}

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
  const bug = resolveActiveBug();
  if (bug !== null) {
    document.documentElement.dataset.reproDefect = bug;
  } else {
    delete document.documentElement.dataset.reproDefect;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function isBroken(): boolean {
  return document.documentElement.dataset.reproFixture === 'broken';
}

/** True when this bug's defect should run (broken mode + global or matching ?bug=). */
export function isDefectActive(bugId: string): boolean {
  if (!isBroken()) {
    return false;
  }
  const active = document.documentElement.dataset.reproDefect;
  if (active !== undefined) {
    return active === bugId;
  }
  return true;
}
