import { createHmac } from 'node:crypto';

import { canonicalJson, sha256 } from '@repro/core';

import type { HashInput } from '@repro/core';

export type JsonEvidence =
  | string
  | number
  | boolean
  | null
  | readonly JsonEvidence[]
  | { readonly [key: string]: JsonEvidence | undefined };

export interface EvidenceArtifactInput {
  readonly role: string;
  readonly name: string;
  readonly bytes: string | Uint8Array;
  readonly mediaType?: string;
}

export interface EvidenceStep {
  readonly index: number;
  readonly action: string;
  readonly expected?: string;
  readonly observed?: string;
}

export interface EvidenceGeometryDelta {
  readonly selector: string;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
  readonly severity: 'ignore' | 'info' | 'warn' | 'critical';
}

export interface EvidenceInput {
  readonly env: string;
  readonly buildSha: string;
  readonly browser: string;
  readonly viewport: Viewport;
  readonly steps: readonly EvidenceStep[];
  readonly geometryDeltas: readonly EvidenceGeometryDelta[];
  readonly artifacts: readonly EvidenceArtifactInput[];
  readonly createdAt: Date | string;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

export interface EvidenceArtifact {
  readonly role: string;
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly mediaType?: string;
}

export interface EvidenceDocument {
  readonly schemaVersion: 1;
  readonly env: string;
  readonly buildSha: string;
  readonly browser: string;
  readonly viewport: Viewport;
  readonly steps: readonly EvidenceStep[];
  readonly geometryDeltas: readonly EvidenceGeometryDelta[];
  readonly artifacts: readonly EvidenceArtifact[];
  readonly createdAt: string;
}

export interface EvidenceSignature {
  readonly profile: 'hmac-sha256';
  readonly keyId: string;
  readonly value: string;
}

export interface SignedEvidence {
  readonly evidence: EvidenceDocument;
  readonly canonical: string;
  readonly signature: EvidenceSignature;
}

export interface EvidenceSigner {
  readonly keyId: string;
  readonly profile: 'hmac-sha256';
  signCanonical(canonical: string): Promise<string>;
}

export function hmacEvidenceSigner(input: {
  readonly keyId: string;
  readonly secret: string | Uint8Array;
}): EvidenceSigner {
  return {
    keyId: input.keyId,
    profile: 'hmac-sha256',
    signCanonical(canonical: string): Promise<string> {
      const signature = createHmac('sha256', input.secret)
        .update(canonical)
        .digest('hex');
      return Promise.resolve(signature);
    },
  };
}

export async function buildSignedEvidence(
  input: EvidenceInput,
  signer: EvidenceSigner,
): Promise<SignedEvidence> {
  const evidence = buildEvidenceDocument(input);
  const canonical = canonicalizeEvidence(evidence);
  const value = await signer.signCanonical(canonical);

  return {
    canonical,
    evidence,
    signature: { keyId: signer.keyId, profile: signer.profile, value },
  };
}

export function buildEvidenceDocument(input: EvidenceInput): EvidenceDocument {
  return {
    artifacts: input.artifacts.map(evidenceArtifact),
    browser: input.browser,
    buildSha: input.buildSha,
    createdAt: utcIso(input.createdAt),
    env: input.env,
    geometryDeltas: input.geometryDeltas,
    schemaVersion: 1,
    steps: input.steps,
    viewport: input.viewport,
  };
}

export function canonicalizeEvidence(input: unknown): string {
  return canonicalJson(input as HashInput);
}

function evidenceArtifact(input: EvidenceArtifactInput): EvidenceArtifact {
  const bytes = bytesOf(input.bytes);
  const base = {
    bytes: bytes.byteLength,
    name: input.name,
    role: input.role,
    sha256: sha256(bytes),
  };

  return input.mediaType === undefined
    ? base
    : { ...base, mediaType: input.mediaType };
}

function bytesOf(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

function utcIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('createdAt must be a valid date');
  }

  return date.toISOString();
}
