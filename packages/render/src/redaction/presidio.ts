import type { JsonValue } from '@repro/core';

export type RedactionEntity = 'credit-card' | 'email' | 'phone' | 'ssn';

export interface RedactionHit {
  readonly entity: RedactionEntity;
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

export interface RedactionResult {
  readonly redacted: string;
  readonly hits: readonly RedactionHit[];
}

export interface StreamRedactor {
  redactJson(value: JsonValue): { readonly hits: readonly RedactionHit[]; readonly value: JsonValue };
  redactText(text: string): RedactionResult;
}

export interface PresidioLikeRedactorOptions {
  readonly replacement?: string;
}

interface PatternDetector {
  readonly entity: RedactionEntity;
  readonly pattern: RegExp;
  readonly validate?: (value: string) => boolean;
}

const DETECTORS: readonly PatternDetector[] = [
  {
    entity: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/gu,
  },
  {
    entity: 'email',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
  },
  {
    entity: 'phone',
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/gu,
  },
  {
    entity: 'credit-card',
    pattern: /\b(?:\d[ -]*?){13,19}\b/gu,
    validate: luhnValid,
  },
];

export function createPresidioLikeRedactor(
  options: PresidioLikeRedactorOptions = {},
): StreamRedactor {
  const replacement = options.replacement ?? '[redacted]';

  return {
    redactJson: (value) => redactJson(value, replacement),
    redactText: (text) => redactText(text, replacement),
  };
}

export function redactText(text: string, replacement = '[redacted]'):
  RedactionResult {
  const hits = findRedactionHits(text);
  let cursor = 0;
  let redacted = '';

  for (const hit of hits) {
    redacted += text.slice(cursor, hit.start);
    redacted += replacement;
    cursor = hit.end;
  }

  return {
    hits,
    redacted: redacted + text.slice(cursor),
  };
}

export function findRedactionHits(text: string): readonly RedactionHit[] {
  const hits = DETECTORS.flatMap((detector) => detectorHits(detector, text));
  return mergeOverlappingHits(hits);
}

function redactJson(
  value: JsonValue,
  replacement: string,
): { readonly hits: readonly RedactionHit[]; readonly value: JsonValue } {
  if (typeof value === 'string') {
    const result = redactText(value, replacement);
    return { hits: result.hits, value: result.redacted };
  }

  if (Array.isArray(value)) {
    return redactArray(value, replacement);
  }

  if (isObject(value)) {
    return redactObject(value, replacement);
  }

  return { hits: [], value };
}

function redactArray(
  value: readonly JsonValue[],
  replacement: string,
): { readonly hits: readonly RedactionHit[]; readonly value: JsonValue } {
  const items = value.map((item) => redactJson(item, replacement));

  return {
    hits: items.flatMap((item) => item.hits),
    value: items.map((item) => item.value),
  };
}

function redactObject(
  value: Readonly<Record<string, JsonValue>>,
  replacement: string,
): { readonly hits: readonly RedactionHit[]; readonly value: JsonValue } {
  const entries = Object.entries(value).map(([key, item]) => {
    return [key, redactJson(item, replacement)] as const;
  });

  return {
    hits: entries.flatMap((entry) => entry[1].hits),
    value: Object.fromEntries(
      entries.map(([key, item]) => [key, item.value]),
    ),
  };
}

function detectorHits(
  detector: PatternDetector,
  text: string,
): readonly RedactionHit[] {
  const hits: RedactionHit[] = [];

  for (const match of text.matchAll(detector.pattern)) {
    const value = match[0];
    const start = match.index;

    if (detector.validate?.(value) === false) {
      continue;
    }

    hits.push({
      end: start + value.length,
      entity: detector.entity,
      start,
      text: value,
    });
  }

  return hits;
}

function mergeOverlappingHits(
  hits: readonly RedactionHit[],
): readonly RedactionHit[] {
  return [...hits]
    .sort((left, right) => left.start - right.start)
    .filter((hit, index, sorted) => {
      const previous = sorted[index - 1];
      return previous === undefined || previous.end <= hit.start;
    });
}

function luhnValid(value: string): boolean {
  const digits = value.replaceAll(/\D/gu, '');

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let alternate = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);

    if (alternate) {
      digit *= 2;
      digit = digit > 9 ? digit - 9 : digit;
    }

    sum += digit;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

function isObject(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
