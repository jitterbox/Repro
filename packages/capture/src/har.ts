import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { denyByDefaultHarPolicy } from '@jitterbox/repro-core/redactor';

import type { HarRedactionPolicy } from '@jitterbox/repro-core/redactor';

export interface HarSanitizerOptions {
  readonly allowedHeaders?: readonly string[];
  readonly allowedQueryParams?: readonly string[];
  readonly allowRequestBodyForUrls?: readonly string[];
  readonly allowResponseBodyForUrls?: readonly string[];
  readonly redactedValue?: string;
}

type MutableRecord = Record<string, unknown>;

const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
]);

const OAUTH_QUERY_NAMES = new Set([
  'access_token',
  'code',
  'id_token',
  'oauth_token',
  'refresh_token',
]);

export function sanitizeHar<T>(
  har: T,
  options: HarSanitizerOptions = defaultHarSanitizerOptions(),
): T {
  const clone = jsonClone(har);
  const entries = harEntries(clone);
  for (const page of arrayFrom(recordFrom(recordFrom(clone).log).pages))
    page.title = redactedValue(options);
  stripComments(clone);

  for (const entry of entries) {
    sanitizeEntry(entry, options);
  }

  return clone;
}

export async function sanitizeHarFile(
  inputPath: string,
  outputPath: string,
  options: HarSanitizerOptions = defaultHarSanitizerOptions(),
): Promise<void> {
  const rawHar = JSON.parse(await readFile(inputPath, 'utf8')) as unknown;
  const sanitized = sanitizeHar(rawHar, options);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`);

  if (inputPath !== outputPath) {
    await unlink(inputPath).catch(() => undefined);
  }
}

// HAR comments are unrestricted prose and can contain request values or failures.
function stripComments(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripComments(item);
    return;
  }
  if (!isRecord(value)) return;
  delete value.comment;
  for (const child of Object.values(value)) stripComments(child);
}

function sanitizeEntry(
  entry: MutableRecord,
  options: HarSanitizerOptions,
): void {
  const request = recordFrom(entry.request);
  const response = recordFrom(entry.response);
  const url = stringFrom(request.url);

  request.url = sanitizeUrl(url, options);
  request.cookies = [];
  response.cookies = [];
  if (typeof response.redirectURL === 'string')
    response.redirectURL = sanitizeUrl(response.redirectURL, options);
  sanitizeHeaders(request, options);
  sanitizeHeaders(response, options);
  sanitizeQuery(request, options);
  sanitizeRequestBody(request, url, options);
  sanitizeResponseBody(response, url, options);
}

function sanitizeUrl(raw: string, options: HarSanitizerOptions): string {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol))
      return redactedValue(options);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) {
      if (OAUTH_QUERY_NAMES.has(name.toLowerCase()))
        url.searchParams.delete(name);
      else if (!allowedName(name, options.allowedQueryParams))
        url.searchParams.set(name, redactedValue(options));
    }
    return url.toString();
  } catch {
    return redactedValue(options);
  }
}

function sanitizeHeaders(
  owner: MutableRecord,
  options: HarSanitizerOptions,
): void {
  const headers = arrayFrom(owner.headers)
    .filter((header) => !isStrippedHeader(header))
    .map((header) => sanitizeHeader(header, options));

  owner.headers = headers;
}

function sanitizeHeader(
  header: MutableRecord,
  options: HarSanitizerOptions,
): MutableRecord {
  const name = stringFrom(header.name);

  if (!allowedName(name, options.allowedHeaders)) {
    return { ...header, value: redactedValue(options) };
  }

  return header;
}

function sanitizeQuery(
  request: MutableRecord,
  options: HarSanitizerOptions,
): void {
  const query = arrayFrom(request.queryString)
    .filter((param) => !isOauthParam(param))
    .map((param) => sanitizeQueryParam(param, options));

  request.queryString = query;
}

function sanitizeQueryParam(
  param: MutableRecord,
  options: HarSanitizerOptions,
): MutableRecord {
  const name = stringFrom(param.name);

  if (!allowedName(name, options.allowedQueryParams)) {
    return { ...param, value: redactedValue(options) };
  }

  return param;
}

function sanitizeRequestBody(
  request: MutableRecord,
  url: string,
  options: HarSanitizerOptions,
): void {
  const postData = recordFrom(request.postData);

  if (Object.keys(postData).length === 0) {
    return;
  }

  if (urlAllowed(url, options.allowRequestBodyForUrls)) {
    return;
  }

  delete postData.text;
  postData.params = arrayFrom(postData.params).map(stripParamValue);
  request.postData = postData;
}

function sanitizeResponseBody(
  response: MutableRecord,
  url: string,
  options: HarSanitizerOptions,
): void {
  const content = recordFrom(response.content);

  if (Object.keys(content).length === 0) {
    return;
  }

  if (urlAllowed(url, options.allowResponseBodyForUrls)) {
    return;
  }

  delete content.text;
  delete content.encoding;
  response.content = content;
}

function stripParamValue(param: MutableRecord): MutableRecord {
  return { ...param, value: '[redacted]' };
}

function isStrippedHeader(header: MutableRecord): boolean {
  return AUTH_HEADER_NAMES.has(stringFrom(header.name).toLowerCase());
}

function isOauthParam(param: MutableRecord): boolean {
  return OAUTH_QUERY_NAMES.has(stringFrom(param.name).toLowerCase());
}

function allowedName(
  name: string,
  allowedNames: readonly string[] | undefined,
): boolean {
  const normalized = name.toLowerCase();
  return (
    allowedNames?.some((allowed) => allowed.toLowerCase() === normalized) ??
    false
  );
}

function urlAllowed(
  url: string,
  allowedUrls: readonly string[] | undefined,
): boolean {
  return allowedUrls?.some((allowed) => url.startsWith(allowed)) ?? false;
}

function redactedValue(options: HarSanitizerOptions): string {
  return options.redactedValue ?? '[redacted]';
}

function defaultHarSanitizerOptions(): HarSanitizerOptions {
  const policy: HarRedactionPolicy = denyByDefaultHarPolicy();
  return {
    allowRequestBodyForUrls: [...policy.allowRequestBodyForUrls],
    allowResponseBodyForUrls: [...policy.allowResponseBodyForUrls],
    allowedHeaders: [...policy.allowedHeaders],
    allowedQueryParams: [...policy.allowedQueryParams],
    redactedValue: policy.redactedValue,
  };
}

function harEntries(value: unknown): MutableRecord[] {
  const root = recordFrom(value);
  const log = recordFrom(root.log);
  return arrayFrom(log.entries);
}

function arrayFrom(value: unknown): MutableRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function recordFrom(value: unknown): MutableRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is MutableRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringFrom(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
