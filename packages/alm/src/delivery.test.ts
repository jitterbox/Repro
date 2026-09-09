import { expect, it } from 'vitest';
import { AdoClient } from './ado.js';
import { JiraClient } from './jira.js';

for (const system of ['ado', 'jira'] as const) {
  it(`${system} reconciles a lost response without duplicate attachments and verifies remote bytes`, async () => {
    const bytes = new TextEncoder().encode('synthetic audited media');
    let attached = false,
      uploads = 0,
      loseResponse = true,
      corrupt = false;
    const url = 'https://alm.test/attachment/proof';
    const fileName = 'digest-proof.mp4';
    const attachment = {
      id: 'attachment',
      filename: fileName,
      content: url,
      size: bytes.length,
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      await Promise.resolve();
      const target =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        method = init?.method ?? 'GET';
      if (target === url)
        return new Response(corrupt ? bytes.map((n) => n ^ 1) : bytes);
      if (method === 'GET' && target.includes('workitems/'))
        return Response.json({
          relations: attached
            ? [{ rel: 'AttachedFile', url, attributes: { name: fileName } }]
            : [],
        });
      if (method === 'GET' && target.includes('fields=attachment'))
        return Response.json({
          fields: { attachment: attached ? [attachment] : [] },
        });
      if (target.endsWith('/attachment/meta'))
        return Response.json({ enabled: true, uploadLimit: 100000 });
      if (method === 'POST') {
        uploads++;
        if (system === 'ado') return Response.json({ id: 'attachment', url });
        attached = true;
        if (loseResponse) {
          loseResponse = false;
          throw new Error('connection lost after upload');
        }
        return Response.json([attachment]);
      }
      if (method === 'PATCH') {
        attached = true;
        if (loseResponse) {
          loseResponse = false;
          throw new Error('connection lost after linking');
        }
        return Response.json({});
      }
      throw new Error(`Unexpected mock request ${method} ${target}`);
    };
    const send =
      system === 'ado'
        ? () =>
            new AdoClient({
              baseUrl: 'https://alm.test',
              project: 'project',
              fetchImpl,
            }).attachFile({ workItemId: 7, fileName, bytes, idempotent: true })
        : () =>
            new JiraClient({
              baseUrl: 'https://alm.test',
              fetchImpl,
            }).attachFile({
              issueKey: 'BUG-7',
              fileName,
              bytes,
              idempotent: true,
            });
    await expect(send()).rejects.toThrow('connection lost');
    await expect(send()).resolves.toBeDefined();
    expect(uploads).toBe(1);
    corrupt = true;
    await expect(send()).rejects.toThrow('sha256');
    expect(uploads).toBe(1);
    corrupt = false;
    attached = false;
    await expect(send()).resolves.toBeDefined();
    expect(uploads).toBe(2);
  });
}
