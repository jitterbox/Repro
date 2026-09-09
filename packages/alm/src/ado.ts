import {
  assertOk,
  assertSizeBudget,
  artifactBytes,
  verifyDownload,
} from './http.js';

import type { AlmFetch, SizeBudget } from './http.js';

export interface AdoClientOptions {
  readonly baseUrl: string;
  readonly project: string;
  readonly token?: string;
  readonly apiVersion?: string;
  readonly fetchImpl?: AlmFetch;
}

export interface AdoAttachInput extends SizeBudget {
  readonly workItemId: number;
  readonly idempotent?: boolean;
  readonly fileName: string;
  readonly bytes: Uint8Array | string;
  readonly comment?: string;
  readonly contentType?: string;
}

export interface AdoAttachmentResult {
  readonly id?: string;
  readonly url: string;
  readonly bytes: number;
}

export interface JsonPatchOperation {
  readonly op: 'add' | 'replace' | 'remove' | 'test';
  readonly path: string;
  readonly value?: unknown;
}

export class AdoClient {
  readonly #options: AdoClientOptions;
  readonly #fetch: AlmFetch;

  constructor(options: AdoClientOptions) {
    this.#options = options;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async attachFile(input: AdoAttachInput): Promise<AdoAttachmentResult> {
    const bytes = artifactBytes(input.bytes);
    assertSizeBudget(bytes.byteLength, input);

    if (input.idempotent) {
      const response = await this.#fetch(
        `${this.#workItemUrl(input.workItemId)}&$expand=relations`,
        { headers: this.#authHeaders() },
      );
      assertOk(response, 'ADO attachment reconciliation failed');
      const workItem = (await response.json()) as {
        relations?: {
          rel: string;
          url: string;
          attributes?: { name?: string };
        }[];
      };
      const existing = workItem.relations?.find(
        (r) =>
          r.rel === 'AttachedFile' && r.attributes?.name === input.fileName,
      );
      if (existing) {
        await verifyDownload({
          expectedBytes: bytes,
          fetchImpl: this.#fetch,
          headers: this.#authHeaders(),
          url: existing.url,
        });
        return { url: existing.url, bytes: bytes.byteLength };
      }
    }
    const attachment = await this.#uploadAttachment(input, bytes);
    const patch = attachedFilePatch(attachment.url, input.comment);
    await this.patchWorkItem(input.workItemId, patch);

    await verifyDownload({
      expectedBytes: bytes,
      fetchImpl: this.#fetch,
      headers: this.#authHeaders(),
      url: attachment.url,
    });

    return { ...attachment, bytes: bytes.byteLength };
  }

  async patchWorkItem(
    workItemId: number,
    patch: readonly JsonPatchOperation[],
  ): Promise<void> {
    assertUniqueFieldRefs(patch);
    const response = await this.#fetch(this.#workItemUrl(workItemId), {
      body: JSON.stringify(patch),
      headers: {
        ...this.#authHeaders(),
        'Content-Type': 'application/json-patch+json',
      },
      method: 'PATCH',
    });

    assertOk(response, 'ADO work item patch failed');
  }

  async #uploadAttachment(
    input: AdoAttachInput,
    bytes: Uint8Array,
  ): Promise<AdoAttachmentResult> {
    const response = await this.#fetch(this.#attachmentUrl(input.fileName), {
      body: bytes,
      headers: {
        ...this.#authHeaders(),
        'Content-Type': input.contentType ?? 'application/octet-stream',
      },
      method: 'POST',
    });

    assertOk(response, 'ADO attachment upload failed');
    const body = (await response.json()) as AdoUploadResponse;

    if (typeof body.url !== 'string') {
      throw new Error('ADO upload response did not include a URL');
    }

    return body.id === undefined
      ? { url: body.url, bytes: bytes.byteLength }
      : { id: body.id, url: body.url, bytes: bytes.byteLength };
  }

  #attachmentUrl(fileName: string): string {
    const params = new URLSearchParams({
      'api-version': this.#apiVersion(),
      fileName,
    });

    return `${this.#projectUrl()}/_apis/wit/attachments?${params.toString()}`;
  }

  #workItemUrl(workItemId: number): string {
    const params = new URLSearchParams({ 'api-version': this.#apiVersion() });

    return (
      `${this.#projectUrl()}/_apis/wit/workitems/${String(workItemId)}` +
      `?${params.toString()}`
    );
  }

  #projectUrl(): string {
    const base = this.#options.baseUrl.replace(/\/$/u, '');
    const project = encodeURIComponent(this.#options.project);

    return `${base}/${project}`;
  }

  #apiVersion(): string {
    return this.#options.apiVersion ?? '7.1';
  }

  #authHeaders(): Record<string, string> {
    if (this.#options.token === undefined) {
      return {};
    }

    return { Authorization: `Bearer ${this.#options.token}` };
  }
}

export function attachedFilePatch(
  url: string,
  comment?: string,
): readonly JsonPatchOperation[] {
  const attributes = comment === undefined ? {} : { comment };

  return [
    {
      op: 'add',
      path: '/relations/-',
      value: { attributes, rel: 'AttachedFile', url },
    },
  ];
}

export function assertUniqueFieldRefs(
  patch: readonly JsonPatchOperation[],
): void {
  const refs = new Set<string>();

  for (const operation of patch) {
    const ref = fieldRef(operation.path);
    if (ref === null) {
      continue;
    }

    if (refs.has(ref)) {
      throw new Error(`field ${ref} appears more than once in one patch`);
    }

    refs.add(ref);
  }
}

interface AdoUploadResponse {
  readonly id?: string;
  readonly url?: string;
}

function fieldRef(path: string): string | null {
  const prefix = '/fields/';

  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}
