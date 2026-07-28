import { createHash } from 'node:crypto';

export type HashInput =
  | string
  | Uint8Array
  | number
  | boolean
  | null
  | readonly HashInput[]
  | HashRecord;

export interface HashRecord {
  readonly [key: string]: HashInput | undefined;
}

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashChain(
  prevHash: string | null | undefined,
  payload: HashInput,
): string {
  return contentAddress({
    payload,
    prevHash: prevHash ?? null,
  });
}

export function contentAddress(input: HashInput): string {
  if (typeof input === 'string' || input instanceof Uint8Array) {
    return sha256(input);
  }

  return sha256(canonicalJson(input));
}

export function canonicalJson(input: HashInput): string {
  if (input === null || typeof input !== 'object') {
    return encodePrimitive(input);
  }

  if (input instanceof Uint8Array) {
    return JSON.stringify(Buffer.from(input).toString('base64'));
  }

  if (isHashArray(input)) {
    return `[${input.map((value) => canonicalJson(value)).join(',')}]`;
  }

  return encodeObject(input);
}

function encodePrimitive(input: string | number | boolean | null): string {
  if (typeof input === 'number' && !Number.isFinite(input)) {
    throw new TypeError('Cannot hash non-finite numbers');
  }

  return JSON.stringify(input);
}

function encodeObject(
  input: HashRecord,
): string {
  const parts = Object.keys(input)
    .sort()
    .flatMap((key) => {
      const value = input[key];
      return value === undefined
        ? []
        : [`${JSON.stringify(key)}:${canonicalJson(value)}`];
    });

  return `{${parts.join(',')}}`;
}

function isHashArray(input: object): input is readonly HashInput[] {
  return Array.isArray(input);
}
