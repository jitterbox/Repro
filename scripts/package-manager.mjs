import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
export function packageManagerInvocation(name, args) {
  if (
    name === 'pnpm' &&
    /[\\/]pnpm\.(?:c?js)$/.test(process.env.npm_execpath ?? '')
  )
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
    };
  if (process.platform !== 'win32') return { command: name, args };
  if (
    name === 'pnpm' &&
    /[\\/]pnpm\.exe$/i.test(process.env.npm_execpath ?? '') &&
    existsSync(process.env.npm_execpath)
  )
    return { command: process.env.npm_execpath, args };
  const candidates = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((dir) => [
      join(dir, 'node_modules', name, 'bin', `${name}.cjs`),
      join(dir, 'node_modules', name, 'bin', `${name}-cli.js`),
    ]);
  try {
    candidates.unshift(require.resolve(`${name}/bin/${name}.cjs`));
  } catch {
    /* PATH installation next. */
  }
  const script = candidates.find(existsSync);
  if (!script)
    throw new Error(
      `Cannot locate ${name}'s Node entrypoint. Run this script with pnpm run, or install pnpm via npm install -g pnpm@9.15.0.`,
    );
  return { command: process.execPath, args: [script, ...args] };
}
