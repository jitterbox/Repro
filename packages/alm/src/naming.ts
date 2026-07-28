export interface EvidenceFilenameInput {
  readonly issueId: string;
  readonly slug: string;
  readonly env: string;
  readonly sha: string;
  readonly recordedAt: Date | string;
}

export function evidenceFilename(input: EvidenceFilenameInput): string {
  const issueId = cleanToken(input.issueId, 'issue');
  const slug = slugToken(input.slug);
  const env = slugToken(input.env);
  const sha7 = cleanSha(input.sha);
  const stamp = basicUtc(input.recordedAt);

  return `${issueId}__${slug}__${env}__${sha7}__${stamp}.mp4`;
}

export function basicUtc(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('recordedAt must be a valid date');
  }

  const year = date.getUTCFullYear().toString().padStart(4, '0');
  const month = part(date.getUTCMonth() + 1);
  const day = part(date.getUTCDate());
  const hour = part(date.getUTCHours());
  const minute = part(date.getUTCMinutes());
  const second = part(date.getUTCSeconds());

  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function cleanSha(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-f0-9]/gu, '');

  if (cleaned.length < 7) {
    throw new TypeError('sha must contain at least seven hex characters');
  }

  return cleaned.slice(0, 7);
}

function cleanToken(value: string, fallback: string): string {
  const cleaned = value.trim().replaceAll(/\s+/gu, '-');
  const token = cleaned.replaceAll(/[^A-Za-z0-9._-]/gu, '-');

  return compactDashes(token) || fallback;
}

function slugToken(value: string): string {
  const token = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-');

  return compactDashes(token) || 'repro';
}

function compactDashes(value: string): string {
  return value.replaceAll(/-+/gu, '-').replaceAll(/^-|-$/gu, '');
}

function part(value: number): string {
  return value.toString().padStart(2, '0');
}
