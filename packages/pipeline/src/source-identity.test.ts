import {
  mkdtemp,
  mkdir,
  writeFile,
  utimes,
  rm,
  stat,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  scenarioConfigFile,
  scenarioSourceIdentity,
} from './source-identity.js';
it('hashes imported helper contents despite unchanged timestamps without executing or emitting code', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-inputs-'));
  try {
    const nested = join(root, 'scenarios');
    await mkdir(nested);
    const spec = join(nested, 'scenario.ts'),
      helper = join(root, 'helper.ts');
    await writeFile(
      spec,
      "import {value} from '../helper'; throw new Error('must not execute'); console.log(value);",
    );
    await writeFile(helper, 'export const value=1;');
    const before = await scenarioSourceIdentity([spec]),
      metadata = await stat(helper);
    await writeFile(helper, 'export const value=2;');
    await utimes(helper, metadata.atime, metadata.mtime);
    expect(await scenarioSourceIdentity([spec])).not.toBe(before);
    expect(await readdir(nested)).toEqual(['scenario.ts']);
    await rm(helper);
    await expect(scenarioSourceIdentity([spec])).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('fingerprints automatically selected configuration and its imported helpers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'repro-config-inputs-'));
  try {
    expect(await scenarioConfigFile(undefined, root)).toBeUndefined();
    const config = join(root, 'playwright.config.ts');
    const helper = join(root, 'settings.ts');
    await writeFile(
      config,
      "import { settings } from './settings'; export default settings;",
    );
    await writeFile(join(root, 'playwright.config.js'), 'export default {};');
    await writeFile(
      helper,
      "export const settings = { use: { locale: 'en-US' } };",
    );
    expect(await scenarioConfigFile(undefined, root)).toBe(config);
    expect(await scenarioConfigFile('.', root)).toBe(config);
    expect(await scenarioConfigFile('playwright.config.js', root)).toBe(
      join(root, 'playwright.config.js'),
    );
    const before = await scenarioSourceIdentity([config]);
    await writeFile(
      helper,
      "export const settings = { use: { locale: 'fr-FR' } };",
    );
    expect(await scenarioSourceIdentity([config])).not.toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
