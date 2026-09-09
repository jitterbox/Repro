import {
  assertOk,
  assertSizeBudget,
  artifactBytes,
  verifyDownload,
} from './http.js';

import type { AlmFetch, SizeBudget } from './http.js';

export interface JiraClientOptions {
  readonly baseUrl: string;
  readonly token?: string;
  readonly fetchImpl?: AlmFetch;
}

export interface JiraAttachInput extends SizeBudget {
  readonly issueKey: string;
  readonly idempotent?: boolean;
  readonly fileName: string;
  readonly bytes: Uint8Array | string;
  readonly contentType?: string;
}

export interface JiraAttachmentResult {
  readonly id: string;
  readonly filename: string;
  readonly content: string;
  readonly size: number;
}

export interface JiraAttachmentMeta {
  readonly enabled: boolean;
  readonly uploadLimit: number;
}

export class JiraClient {
  readonly #options: JiraClientOptions;
  readonly #fetch: AlmFetch;

  constructor(options: JiraClientOptions) {
    this.#options = options;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async discoverAttachmentLimit(): Promise<JiraAttachmentMeta> {
    const response = await this.#fetch(
      this.#url('/rest/api/3/attachment/meta'),
      {
        headers: this.#authHeaders(),
        method: 'GET',
      },
    );

    assertOk(response, 'Jira attachment metadata request failed');
    const meta = (await response.json()) as JiraAttachmentMeta;

    if (!meta.enabled) {
      throw new Error('Jira attachments are disabled');
    }

    return meta;
  }

  async attachFile(input: JiraAttachInput): Promise<JiraAttachmentResult> {
    const bytes = artifactBytes(input.bytes);
    if (input.idempotent) {
      const response = await this.#fetch(
        this.#url(
          `/rest/api/3/issue/${encodeURIComponent(input.issueKey)}?fields=attachment`,
        ),
        { headers: this.#authHeaders() },
      );
      assertOk(response, 'Jira attachment reconciliation failed');
      const issue = (await response.json()) as {
        fields?: { attachment?: JiraAttachmentResult[] };
      };
      const existing = issue.fields?.attachment?.find(
        (a) => a.filename === input.fileName,
      );
      if (existing) {
        await verifyDownload({
          expectedBytes: bytes,
          fetchImpl: this.#fetch,
          headers: this.#authHeaders(),
          url: existing.content,
        });
        return existing;
      }
    }
    const meta = await this.discoverAttachmentLimit();
    assertJiraLimit(bytes.byteLength, meta.uploadLimit);
    assertSizeBudget(bytes.byteLength, input);

    const result = await this.#upload(input, bytes);
    await verifyDownload({
      expectedBytes: bytes,
      fetchImpl: this.#fetch,
      headers: this.#authHeaders(),
      url: result.content,
    });

    return result;
  }

  async #upload(
    input: JiraAttachInput,
    bytes: Uint8Array,
  ): Promise<JiraAttachmentResult> {
    const form = new FormData();
    const blob = new Blob([bytes], {
      type: input.contentType ?? 'application/octet-stream',
    });
    form.append('file', blob, input.fileName);

    const response = await this.#fetch(this.#attachmentUrl(input.issueKey), {
      body: form,
      headers: {
        ...this.#authHeaders(),
        'X-Atlassian-Token': 'no-check',
      },
      method: 'POST',
    });

    assertOk(response, 'Jira attachment upload failed');
    const attachments =
      (await response.json()) as readonly JiraUploadResponse[];
    const first = attachments[0];

    if (first === undefined) {
      throw new Error('Jira upload response did not include an attachment');
    }

    return normalizeAttachment(first);
  }

  #attachmentUrl(issueKey: string): string {
    const encoded = encodeURIComponent(issueKey);

    return this.#url(`/rest/api/3/issue/${encoded}/attachments`);
  }

  #url(path: string): string {
    return `${this.#options.baseUrl.replace(/\/$/u, '')}${path}`;
  }

  #authHeaders(): Record<string, string> {
    if (this.#options.token === undefined) {
      return {};
    }

    return { Authorization: `Bearer ${this.#options.token}` };
  }
}

interface JiraUploadResponse {
  readonly id?: string;
  readonly filename?: string;
  readonly content?: string;
  readonly size?: number;
}

function assertJiraLimit(size: number, limit: number): void {
  if (size > limit) {
    throw new RangeError('Jira artifact exceeds discovered upload limit');
  }
}

function normalizeAttachment(input: JiraUploadResponse): JiraAttachmentResult {
  if (input.id === undefined || input.content === undefined) {
    throw new Error('Jira attachment response was missing id or content URL');
  }

  return {
    content: input.content,
    filename: input.filename ?? '',
    id: input.id,
    size: input.size ?? 0,
  };
}
