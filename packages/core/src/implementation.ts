import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Fingerprints the actual built implementation; source maps and timestamps are excluded. */
export function implementationDigest(entryUrl: string): string {
  const root = dirname(entryUrl.startsWith('file:') ? fileURLToPath(entryUrl) : entryUrl);
  const hash = createHash('sha256');
  const files = readdirSync(root, { recursive: true })
    .filter(
      (name): name is string =>
        typeof name === 'string' && /(?<!\.test)(?<!\.d)\.(js|ts|tsx|json)$/.test(name),
    )
    .sort();
  for (const name of files)
    hash.update(name).update(readFileSync(join(root, name)));
  return hash.digest('hex');
}
