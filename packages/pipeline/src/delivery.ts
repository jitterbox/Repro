import {
  readFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { AdoClient, JiraClient, outboxIdempotencyKey } from '@jitterbox/repro-alm';
import { sha256, withFileLock } from '@jitterbox/repro-core';
import { enforceOcrAudit } from '@jitterbox/repro-render';
/** Credentials stay in the process environment; receipts contain only artifact identity and result. */
export async function deliverEvidence(input: {
  system: 'ado' | 'jira';
  evidence: string;
  issue: string;
  baseUrl: string;
  project?: string;
  role?: string;
  stateDir?: string;
  privacyPatterns?: readonly string[];
}) {
  const destination = new URL(input.baseUrl);
  if (
    !['https:', 'http:'].includes(destination.protocol) ||
    destination.username ||
    destination.password ||
    destination.search ||
    destination.hash
  )
    throw new Error(
      'ALM destination must be an HTTP(S) URL without credentials, query or fragment',
    );
  if (
    input.system === 'ado' &&
    (!/^\d+$/.test(input.issue) || !Number.isSafeInteger(Number(input.issue)))
  )
    throw new Error('ADO issue must be an integer work-item ID');
  if (!['.mp4', '.png'].includes(extname(input.evidence).toLowerCase()))
    throw new Error(
      'Delivery requires audited presentation MP4 or PNG evidence',
    );
  const bytes = await readFile(input.evidence),
    digest = sha256(bytes);
  const key = outboxIdempotencyKey({
    destination: `${input.system}:${input.baseUrl}:${input.project ?? ''}`,
    issue: input.issue,
    digest,
    role: input.role ?? 'proof',
  });
  const root = resolve(input.stateDir ?? '.repro/outbox');
  await mkdir(root, { recursive: true });
  const lock = join(root, `${key}.lock`);
  return withFileLock(lock, async () => {
    let snapshot: string | undefined;
    try {
      snapshot = await mkdtemp(join(root, 'audit-'));
      const media = join(snapshot, `proof${extname(input.evidence)}`);
      await writeFile(media, bytes, { flag: 'wx' });
      await enforceOcrAudit({
        path: media,
        redaction: { masks: [], maskConcealedInputs: false, strict: true },
        requireAudit: true,
        ...(input.privacyPatterns ? { patterns: input.privacyPatterns } : {}),
      });
      const audit = JSON.parse(
        await readFile(`${media}.audit.json`, 'utf8'),
      ) as { sha256?: string; passed?: boolean; source?: string };
      if (
        sha256(await readFile(media)) !== digest ||
        audit.sha256 !== digest ||
        audit.passed !== true ||
        audit.source !== 'frame-ocr'
      )
        throw new Error(
          'Delivery audit does not match the immutable upload bytes',
        );
      // Reconcile remote state even when a local receipt exists. Never report a deleted remote file as delivered.
      const fileName = `repro-${digest.slice(0, 16)}${extname(input.evidence).toLowerCase()}`;
      const receiptPath = join(root, `${key}.json`);
      await writeFile(
        receiptPath,
        JSON.stringify({ key, digest, status: 'pending', issue: input.issue }),
      );
      const token =
        process.env[
          input.system === 'ado' ? 'REPRO_ADO_TOKEN' : 'REPRO_JIRA_TOKEN'
        ];
      const auth = token ? { token } : {};
      const result =
        input.system === 'ado'
          ? await new AdoClient({
              baseUrl: input.baseUrl,
              project: input.project ?? '',
              ...auth,
            }).attachFile({
              workItemId: Number(input.issue),
              fileName,
              bytes,
              idempotent: true,
            })
          : await new JiraClient({
              baseUrl: input.baseUrl,
              ...auth,
            }).attachFile({
              issueKey: input.issue,
              fileName,
              bytes,
              idempotent: true,
            });
      const receipt = {
        key,
        digest,
        status: 'sent',
        issue: input.issue,
        result,
        verifiedAt: new Date().toISOString(),
      };
      const temporary = `${receiptPath}.tmp`;
      await writeFile(temporary, JSON.stringify(receipt, null, 2));
      await rename(temporary, receiptPath);
      return receipt;
    } finally {
      if (snapshot) await rm(snapshot, { recursive: true, force: true });
    }
  });
}
