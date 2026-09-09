import { readFile, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { AdoClient, JiraClient, outboxIdempotencyKey } from '@repro/alm';
import { sha256 } from '@repro/core';
import { enforceOcrAudit } from '@repro/render';
/** Credentials stay in the process environment; receipts contain only artifact identity and result. */
export async function deliverEvidence(input: {
  system: 'ado' | 'jira';
  evidence: string;
  issue: string;
  baseUrl: string;
  project?: string;
  role?: string;
}) {
  await enforceOcrAudit({
    path: input.evidence,
    redaction: { masks: [], strict: true },
    requireAudit: true,
  });
  const bytes = await readFile(input.evidence),
    digest = sha256(bytes);
  const key = outboxIdempotencyKey({
    destination: `${input.system}:${input.baseUrl}:${input.project ?? ''}`,
    issue: input.issue,
    digest,
    role: input.role ?? 'proof',
  });
  const root = join(dirname(input.evidence), 'outbox');
  await mkdir(root, { recursive: true });
  const lock = join(root, `${key}.lock`);
  const handle = await open(lock, 'wx');
  try {
    // Reconcile remote state even when a local receipt exists. Never report a deleted remote file as delivered.
    const fileName = `${digest.slice(0, 16)}-${basename(input.evidence)}`;
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
        : await new JiraClient({ baseUrl: input.baseUrl, ...auth }).attachFile({
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
    await handle.close();
    await rm(lock, { force: true });
  }
}
