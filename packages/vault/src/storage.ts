import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';

import { sha256 } from '@jitterbox/repro-core';

export interface VaultOptions {
  readonly masterKey?: Uint8Array;
  readonly acl?: AclProvider;
}

export interface AclProvider {
  canRead(input: AclRequest): boolean;
  canWrite(input: AclRequest): boolean;
}

export interface AclRequest {
  readonly actor: string;
  readonly caseId: string;
}

export interface VaultArtifact {
  readonly role: string;
  readonly name: string;
  readonly bytes: Uint8Array | string;
}

export interface CasePayload {
  readonly issueId: string;
  readonly env: string;
  readonly title: string;
  readonly artifacts: readonly VaultArtifact[];
  readonly metadata?: Record<string, string>;
}

export interface StoreCaseInput {
  readonly actor: string;
  readonly caseId?: string;
  readonly payload: CasePayload;
  readonly nowEpoch?: number;
}

export interface VaultPreview {
  readonly caseId: string;
  readonly issueId: string;
  readonly env: string;
  readonly title: string;
  readonly artifactPreviews: readonly VaultArtifactPreview[];
}

export interface VaultArtifactPreview {
  readonly role: string;
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface VaultAuditEvent {
  readonly action: string;
  readonly actor: string;
  readonly caseId: string;
  readonly atEpoch: number;
}

export class EncryptedCaseVault {
  readonly #masterKey: Uint8Array;
  readonly #acl: AclProvider;
  readonly #records = new Map<string, VaultRecord>();
  readonly auditEvents: VaultAuditEvent[] = [];

  constructor(options: VaultOptions = {}) {
    this.#masterKey = options.masterKey ?? randomBytes(32);
    this.#acl = options.acl ?? allowAllAcl();
    assertKey(this.#masterKey);
  }

  storeCase(input: StoreCaseInput): string {
    const caseId = input.caseId ?? randomUUID();
    this.#assertWrite(input.actor, caseId);

    const envelopeKey = randomBytes(32);
    const encryptedPayload = encryptBytes(
      jsonBytes(input.payload),
      envelopeKey,
    );
    const wrappedKey = encryptBytes(envelopeKey, this.#masterKey);

    this.#records.set(caseId, {
      createdAtEpoch: input.nowEpoch ?? Date.now(),
      encryptedPayload,
      preview: sanitizePreview(caseId, input.payload),
      wrappedKey,
    });
    this.#audit('vault.store', input.actor, caseId, input.nowEpoch);

    return caseId;
  }

  readCase(input: AclRequest): CasePayload {
    this.#assertRead(input.actor, input.caseId);
    const record = this.#required(input.caseId);
    const envelopeKey = decryptBytes(record.wrappedKey, this.#masterKey);
    const payloadBytes = decryptBytes(record.encryptedPayload, envelopeKey);
    this.#audit('vault.read', input.actor, input.caseId);

    const json = new TextDecoder().decode(payloadBytes);

    return JSON.parse(json, jsonReviver) as CasePayload;
  }

  previewCase(input: AclRequest): VaultPreview {
    this.#assertRead(input.actor, input.caseId);
    this.#audit('vault.preview', input.actor, input.caseId);

    return this.#required(input.caseId).preview;
  }

  deleteCase(input: AclRequest): void {
    this.#assertWrite(input.actor, input.caseId);
    this.#records.delete(input.caseId);
    this.#audit('vault.delete', input.actor, input.caseId);
  }

  applyRetention(input: {
    readonly actor: string;
    readonly ttlMs: number;
    readonly nowEpoch?: number;
  }): readonly string[] {
    const deleted: string[] = [];
    const now = input.nowEpoch ?? Date.now();

    for (const [caseId, record] of this.#records) {
      if (record.createdAtEpoch + input.ttlMs > now) {
        continue;
      }

      this.deleteCase({ actor: input.actor, caseId });
      deleted.push(caseId);
    }

    return deleted;
  }

  #assertRead(actor: string, caseId: string): void {
    if (!this.#acl.canRead({ actor, caseId })) {
      throw new Error('actor is not allowed to read this case');
    }
  }

  #assertWrite(actor: string, caseId: string): void {
    if (!this.#acl.canWrite({ actor, caseId })) {
      throw new Error('actor is not allowed to write this case');
    }
  }

  #required(caseId: string): VaultRecord {
    const record = this.#records.get(caseId);

    if (record === undefined) {
      throw new Error(`case ${caseId} was not found`);
    }

    return record;
  }

  #audit(
    action: string,
    actor: string,
    caseId: string,
    atEpoch = Date.now(),
  ): void {
    this.auditEvents.push({ action, actor, atEpoch, caseId });
  }
}

interface VaultRecord {
  readonly createdAtEpoch: number;
  readonly encryptedPayload: EncryptedBytes;
  readonly preview: VaultPreview;
  readonly wrappedKey: EncryptedBytes;
}

interface EncryptedBytes {
  readonly algorithm: 'aes-256-gcm';
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
  readonly tag: Uint8Array;
}

export function allowAllAcl(): AclProvider {
  return {
    canRead(): boolean {
      return true;
    },
    canWrite(): boolean {
      return true;
    },
  };
}

function encryptBytes(bytes: Uint8Array, key: Uint8Array): EncryptedBytes {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);

  return {
    algorithm: 'aes-256-gcm',
    ciphertext,
    iv,
    tag: cipher.getAuthTag(),
  };
}

function decryptBytes(input: EncryptedBytes, key: Uint8Array): Uint8Array {
  const decipher = createDecipheriv(input.algorithm, key, input.iv);
  decipher.setAuthTag(input.tag);

  return Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
}

function sanitizePreview(caseId: string, payload: CasePayload): VaultPreview {
  return {
    artifactPreviews: payload.artifacts.map(artifactPreview),
    caseId,
    env: payload.env,
    issueId: payload.issueId,
    title: payload.title,
  };
}

function artifactPreview(input: VaultArtifact): VaultArtifactPreview {
  const bytes = artifactBytes(input.bytes);

  return {
    bytes: bytes.byteLength,
    name: input.name,
    role: input.role,
    sha256: sha256(bytes),
  };
}

function artifactBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

function jsonBytes(input: CasePayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(input, jsonReplacer));
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { type: 'Uint8Array', value: [...value] };
  }

  return value;
}

function jsonReviver(_key: string, value: unknown): unknown {
  if (!isEncodedBytes(value)) {
    return value;
  }

  return Uint8Array.from(value.value);
}

function isEncodedBytes(
  value: unknown,
): value is { readonly type: 'Uint8Array'; readonly value: readonly number[] } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return candidate.type === 'Uint8Array' && Array.isArray(candidate.value);
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== 32) {
    throw new RangeError('master key must be 32 bytes for AES-256-GCM');
  }
}
