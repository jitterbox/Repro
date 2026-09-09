import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sanitizeHar, sanitizeHarFile } from './har.js';

describe('sanitizeHar', () => {
  it('removes auth headers and strips bodies by default', () => {
    const sanitized = sanitizeHar(sampleHar());
    const entry = sanitized.log.entries[0];

    expect(entry?.request.headers).toEqual([
      { name: 'Accept', value: '[redacted]' },
    ]);
    expect(entry?.response.headers).toEqual([
      { name: 'Content-Type', value: '[redacted]' },
    ]);
    expect(entry?.request.postData.text).toBeUndefined();
    expect(entry?.response.content.text).toBeUndefined();
  });

  it('redacts query values and removes oauth codes', () => {
    const sanitized = sanitizeHar(sampleHar());
    const entry = sanitized.log.entries[0];

    expect(entry?.request.queryString).toEqual([
      { name: 'search', value: '[redacted]' },
    ]);
  });

  it('keeps allowlisted header, query, and body values', () => {
    const sanitized = sanitizeHar(sampleHar(), {
      allowedHeaders: ['accept', 'content-type'],
      allowedQueryParams: ['search'],
      allowRequestBodyForUrls: ['https://example.test/api'],
      allowResponseBodyForUrls: ['https://example.test/api'],
    });
    const entry = sanitized.log.entries[0];

    expect(entry?.request.headers).toEqual([
      { name: 'Accept', value: 'application/json' },
    ]);
    expect(entry?.request.queryString).toEqual([
      { name: 'search', value: 'needle' },
    ]);
    expect(entry?.request.postData.text).toBe('secret body');
    expect(entry?.response.content.text).toBe('secret response');
  });

  it('writes sanitized HAR files and removes raw inputs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repro-har-'));
    const rawPath = join(directory, 'network.raw.har');
    const sanitizedPath = join(directory, 'network.har');

    await writeFile(rawPath, JSON.stringify(sampleHar()));
    await sanitizeHarFile(rawPath, sanitizedPath);

    const sanitized = JSON.parse(
      await readFile(sanitizedPath, 'utf8'),
    ) as ReturnType<typeof sampleHar>;
    const rawExists = await exists(rawPath);

    expect(sanitized.log.entries[0]?.request.headers).toEqual([
      { name: 'Accept', value: '[redacted]' },
    ]);
    expect(rawExists).toBe(false);
  });
});

async function exists(path: string): Promise<boolean> {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

function sampleHar() {
  return {
    log: {
      entries: [
        {
          request: {
            headers: [
              { name: 'Authorization', value: 'Bearer token' },
              { name: 'Cookie', value: 'sid=abc' },
              { name: 'Accept', value: 'application/json' },
            ],
            postData: {
              mimeType: 'application/json',
              params: [{ name: 'password', value: 'secret' }],
              text: 'secret body',
            },
            queryString: [
              { name: 'code', value: 'oauth-code' },
              { name: 'search', value: 'needle' },
            ],
            url: 'https://example.test/api',
          },
          response: {
            content: {
              encoding: 'base64',
              mimeType: 'application/json',
              text: 'secret response',
            },
            headers: [
              { name: 'Set-Cookie', value: 'sid=next' },
              { name: 'Content-Type', value: 'application/json' },
            ],
          },
        },
      ],
    },
  };
}

it('removes secrets duplicated in URL credentials, queries, fragments, cookies and redirects', () => {
  const secret = 'repro-canary-secret-hidden';
  const har = {
    log: {
      entries: [
        {
          request: {
            url: `https://user:${secret}@example.test/?access_token=${secret}&q=${secret}#${secret}`,
            cookies: [{ name: 'session', value: secret }],
          },
          response: {
            cookies: [{ name: 'session', value: secret }],
            redirectURL: `https://example.test/?code=${secret}`,
          },
        },
      ],
    },
  };
  expect(JSON.stringify(sanitizeHar(har))).not.toContain(secret);
});

it('redacts page titles, opaque URL payloads and unrestricted HAR comments', () => {
  const har = {log: {pages: [{title: 'private-page'}], comment: 'private-comment', entries: [{request: {url: 'data:text/plain,private-url', comment: 'nested-private'}, response: {}}]}};
  const output = JSON.stringify(sanitizeHar(har));
  expect(output).not.toContain('private');
  expect(output).toContain('[redacted]');
});
